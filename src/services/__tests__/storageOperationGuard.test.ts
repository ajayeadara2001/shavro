import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import {
  runFinancialWrite,
  runExclusiveStorageOperation,
  beginExclusiveStorageOperation,
  hasActiveFinancialWrites,
  isExclusiveStorageOperationActive,
  assertNoExclusiveStorageOperation,
} from "../storageOperationGuard";

import { assertNoPendingRestoreRecovery } from "../restoreRecoveryState";

/**
 * Mock the persistent recovery checker.
 *
 * This lets us simulate:
 * - No pending recovery
 * - Recovery journal present
 * - Storage read failure
 *
 * No real device or browser storage
 * is modified by these tests.
 */
jest.mock("../restoreRecoveryState", () => ({
  assertNoPendingRestoreRecovery: jest.fn(async (): Promise<void> => {}),
}));

const mockRecoveryCheck = jest.mocked(assertNoPendingRestoreRecovery);

/**
 * Create a promise whose completion
 * is controlled by the test.
 */
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

describe("Shavro financial storage coordinator", () => {
  beforeEach(() => {
    mockRecoveryCheck.mockReset();

    // Default: no pending recovery journal.
    mockRecoveryCheck.mockResolvedValue(undefined);
  });

  // -------------------------------------
  // EXISTING CONCURRENCY TESTS
  // -------------------------------------

  test("runs a normal financial write", async () => {
    const result = await runFinancialWrite(async () => "saved");

    expect(result).toBe("saved");

    expect(hasActiveFinancialWrites()).toBe(false);

    expect(mockRecoveryCheck).toHaveBeenCalledTimes(1);
  });

  test("serializes simultaneous financial writes", async () => {
    const firstGate = createDeferred();

    const events: string[] = [];

    const first = runFinancialWrite(async () => {
      events.push("first-start");

      await firstGate.promise;

      events.push("first-end");
    });

    const second = runFinancialWrite(async () => {
      events.push("second-start");
      events.push("second-end");
    });

    expect(hasActiveFinancialWrites()).toBe(true);

    // Flush promise microtasks so the first
    // write can pass its recovery check.
    await Promise.resolve();
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

    expect(hasActiveFinancialWrites()).toBe(false);
  });

  test("rejects restore while a financial write is active", async () => {
    const gate = createDeferred();

    const write = runFinancialWrite(async () => {
      await gate.promise;
    });

    expect(hasActiveFinancialWrites()).toBe(true);

    await expect(
      runExclusiveStorageOperation(async () => "restored"),
    ).rejects.toThrow("Cannot restore financial records");

    gate.resolve();

    await write;

    expect(hasActiveFinancialWrites()).toBe(false);
  });

  test("rejects restore while a financial write is queued", async () => {
    const gate = createDeferred();

    const first = runFinancialWrite(async () => {
      await gate.promise;
    });

    const second = runFinancialWrite(async () => "second saved");

    expect(hasActiveFinancialWrites()).toBe(true);

    await expect(
      runExclusiveStorageOperation(async () => true),
    ).rejects.toThrow("Cannot restore financial records");

    gate.resolve();

    await Promise.all([first, second]);

    expect(hasActiveFinancialWrites()).toBe(false);
  });

  test("blocks new financial writes during restore", async () => {
    const gate = createDeferred();

    const restore = runExclusiveStorageOperation(async () => {
      await gate.promise;

      return "restored";
    });

    expect(isExclusiveStorageOperationActive()).toBe(true);

    await expect(
      runFinancialWrite(async () => "unexpected write"),
    ).rejects.toThrow("Financial records are temporarily unavailable");

    gate.resolve();

    await expect(restore).resolves.toBe("restored");

    expect(isExclusiveStorageOperationActive()).toBe(false);
  });

  test("rejects a second exclusive operation", async () => {
    const gate = createDeferred();

    const first = runExclusiveStorageOperation(async () => {
      await gate.promise;
    });

    await expect(
      runExclusiveStorageOperation(async () => "second restore"),
    ).rejects.toThrow("Another exclusive storage operation");

    gate.resolve();

    await first;

    expect(isExclusiveStorageOperationActive()).toBe(false);
  });

  test("continues queued writes after a write fails", async () => {
    const events: string[] = [];

    const first = runFinancialWrite(async () => {
      events.push("first");

      throw new Error("Simulated write failure");
    });

    const second = runFinancialWrite(async () => {
      events.push("second");

      return "saved";
    });

    await expect(first).rejects.toThrow("Simulated write failure");

    await expect(second).resolves.toBe("saved");

    expect(events).toEqual(["first", "second"]);

    expect(hasActiveFinancialWrites()).toBe(false);
  });

  test("releases exclusive access after restore failure", async () => {
    await expect(
      runExclusiveStorageOperation(async () => {
        throw new Error("Simulated restore failure");
      }),
    ).rejects.toThrow("Simulated restore failure");

    expect(isExclusiveStorageOperationActive()).toBe(false);

    await expect(
      runFinancialWrite(async () => "saved after failure"),
    ).resolves.toBe("saved after failure");
  });

  test("exclusive release function is idempotent", () => {
    const release = beginExclusiveStorageOperation();

    expect(isExclusiveStorageOperationActive()).toBe(true);

    release();
    release();

    expect(isExclusiveStorageOperationActive()).toBe(false);
  });

  test("assertion rejects writes during exclusive access", () => {
    const release = beginExclusiveStorageOperation();

    try {
      expect(() => {
        assertNoExclusiveStorageOperation();
      }).toThrow("Financial records are temporarily unavailable");
    } finally {
      release();
    }

    expect(() => {
      assertNoExclusiveStorageOperation();
    }).not.toThrow();
  });

  // -------------------------------------
  // NEW PERSISTENT RECOVERY TESTS
  // -------------------------------------

  test("allows writes when no recovery journal exists", async () => {
    mockRecoveryCheck.mockResolvedValue(undefined);

    const operation = jest.fn(async () => "expense saved");

    await expect(runFinancialWrite(operation)).resolves.toBe("expense saved");

    expect(mockRecoveryCheck).toHaveBeenCalledTimes(1);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  test("blocks writes when recovery is pending", async () => {
    mockRecoveryCheck.mockRejectedValue(
      new Error("Shavro detected an unfinished backup recovery."),
    );

    const operation = jest.fn(async () => "should not save");

    await expect(runFinancialWrite(operation)).rejects.toThrow(
      "unfinished backup recovery",
    );

    expect(operation).not.toHaveBeenCalled();

    expect(hasActiveFinancialWrites()).toBe(false);
  });

  test("blocks writes when recovery inspection fails", async () => {
    mockRecoveryCheck.mockRejectedValue(
      new Error("Cannot verify recovery state."),
    );

    const operation = jest.fn(async () => "should not save");

    await expect(runFinancialWrite(operation)).rejects.toThrow(
      "Cannot verify recovery state",
    );

    expect(operation).not.toHaveBeenCalled();

    expect(hasActiveFinancialWrites()).toBe(false);
  });

  test("write queue continues after a recovery rejection", async () => {
    const events: string[] = [];

    // First check fails. Second succeeds.
    mockRecoveryCheck
      .mockRejectedValueOnce(new Error("Recovery journal exists."))
      .mockResolvedValueOnce(undefined);

    const first = runFinancialWrite(async () => {
      events.push("first-write");
    });

    const second = runFinancialWrite(async () => {
      events.push("second-write");

      return "saved";
    });

    await expect(first).rejects.toThrow("Recovery journal exists");

    await expect(second).resolves.toBe("saved");

    // The first write never executed.
    expect(events).toEqual(["second-write"]);

    expect(mockRecoveryCheck).toHaveBeenCalledTimes(2);

    expect(hasActiveFinancialWrites()).toBe(false);
  });
});
