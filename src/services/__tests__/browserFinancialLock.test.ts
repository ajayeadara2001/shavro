import {
  afterAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import {
  isBrowserFinancialLockSupported,
  runWithBrowserFinancialLock,
  SHAVRO_BROWSER_LOCK_NAME,
} from "../browserFinancialLock";

// Force the browser implementation
// while testing this service.
jest.mock("react-native", () => ({
  Platform: {
    OS: "web",
  },
}));

type LockCallback<T> = (lock: Lock | null) => Promise<T> | T;

type LockRequestOptions = {
  mode?: "exclusive" | "shared";
};

type MockLockRequest = <T>(
  name: string,
  options: LockRequestOptions,
  callback: LockCallback<T>,
) => Promise<T>;

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;

  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

/**
 * A test-only implementation of the
 * relevant Web Locks API behavior.
 *
 * All requests sharing the same name
 * execute sequentially.
 *
 * This does not replace real-browser
 * multi-tab integration testing.
 */
function createMockLockManager() {
  const queues = new Map<string, Promise<void>>();

  const request: MockLockRequest = async (name, options, callback) => {
    if (options.mode !== "exclusive") {
      throw new Error("Expected exclusive lock.");
    }

    const previous = queues.get(name) ?? Promise.resolve();

    let release!: () => void;

    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    queues.set(name, current);

    await previous;

    try {
      return await callback({
        name,
        mode: "exclusive",
      } as Lock);
    } finally {
      release();

      if (queues.get(name) === current) {
        queues.delete(name);
      }
    }
  };

  return {
    request: jest.fn(request),
  };
}

describe("Shavro browser financial lock", () => {
  const originalLocksDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "locks",
  );

  function setMockLocks(locks: unknown): void {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: locks,
    });
  }

  beforeEach(() => {
    setMockLocks(createMockLockManager());
  });

  afterAll(() => {
    if (originalLocksDescriptor) {
      Object.defineProperty(navigator, "locks", originalLocksDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "locks");
    }
  });

  test("detects browser lock support", () => {
    expect(isBrowserFinancialLockSupported()).toBe(true);
  });

  test("uses the Shavro financial lock name", async () => {
    const locks = createMockLockManager();

    setMockLocks(locks);

    const result = await runWithBrowserFinancialLock(async () => "saved");

    expect(result).toBe("saved");

    expect(locks.request).toHaveBeenCalledWith(
      SHAVRO_BROWSER_LOCK_NAME,
      { mode: "exclusive" },
      expect.any(Function),
    );
  });

  test("serializes two operations using the same lock", async () => {
    const firstGate = createDeferred();

    const events: string[] = [];

    const first = runWithBrowserFinancialLock(async () => {
      events.push("first-start");

      await firstGate.promise;

      events.push("first-end");
    });

    const second = runWithBrowserFinancialLock(async () => {
      events.push("second-start");
      events.push("second-end");
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["first-start"]);

    firstGate.resolve();

    await Promise.all([first, second]);

    expect(events).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  test("releases lock after successful operation", async () => {
    const first = await runWithBrowserFinancialLock(async () => "first saved");

    const second = await runWithBrowserFinancialLock(
      async () => "second saved",
    );

    expect(first).toBe("first saved");
    expect(second).toBe("second saved");
  });

  test("releases lock after an operation fails", async () => {
    await expect(
      runWithBrowserFinancialLock(async () => {
        throw new Error("Simulated storage failure");
      }),
    ).rejects.toThrow("Simulated storage failure");

    await expect(
      runWithBrowserFinancialLock(async () => "recovered"),
    ).resolves.toBe("recovered");
  });

  test("rejects unsupported browsers without executing writes", async () => {
    setMockLocks(undefined);

    expect(isBrowserFinancialLockSupported()).toBe(false);

    const operation = jest.fn(async () => "unsafe write");

    await expect(runWithBrowserFinancialLock(operation)).rejects.toThrow(
      "does not support the secure storage coordination",
    );

    expect(operation).not.toHaveBeenCalled();
  });

  test("rejects when browser returns no lock", async () => {
    const request: MockLockRequest = async (_name, _options, callback) =>
      callback(null);

    setMockLocks({
      request,
    });

    const operation = jest.fn(async () => "unexpected write");

    await expect(runWithBrowserFinancialLock(operation)).rejects.toThrow(
      "could not acquire the financial storage lock",
    );

    expect(operation).not.toHaveBeenCalled();
  });

  test("does not execute a second operation before first lock releases", async () => {
    const gate = createDeferred();

    let secondStarted = false;

    const first = runWithBrowserFinancialLock(async () => {
      await gate.promise;
    });

    const second = runWithBrowserFinancialLock(async () => {
      secondStarted = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(secondStarted).toBe(false);

    gate.resolve();

    await Promise.all([first, second]);

    expect(secondStarted).toBe(true);
  });
});
