import React, { useState } from "react";

import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

// =========================================
// OFFICIAL SHAVRO STARTUP LOGO
// =========================================

const SHAVRO_LOGO = require("../../assets/shavro-startup-logo-rgb.png");

// =========================================
// STARTUP COMPONENT
// =========================================

export default function ShavroStartup() {
  const { width, height } = useWindowDimensions();

  const [imageFailed, setImageFailed] = useState(false);

  const [imageLoaded, setImageLoaded] = useState(false);

  const logoSize = Math.min(width - 48, height * 0.38, 300);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={styles.center}>
          {/* OFFICIAL SHAVRO LOGO */}

          <View style={styles.brandContainer}>
            {!imageFailed && (
              <Image
                source={SHAVRO_LOGO}
                style={{
                  width: logoSize,
                  height: logoSize,
                }}
                resizeMode="contain"
                onLoad={() => {
                  console.log("[Shavro] Startup logo loaded");
                  setImageLoaded(true);
                }}
                onError={(event) => {
                  console.error(
                    "[Shavro] Startup logo failed:",
                    event.nativeEvent.error,
                  );
                  setImageLoaded(true);
                  setImageFailed(true);
                }}
                accessibilityLabel="Shavro official logo"
              />
            )}

            {/* Independent fallback branding */}

            {imageFailed && (
              <View style={styles.fallback}>
                <Text style={styles.brandName}>Shavro</Text>

                <Text style={styles.tagline}>Your Money, Made Simple.</Text>
              </View>
            )}
          </View>

          {/* DATA VERIFICATION */}

          {imageLoaded && (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color="#0879E9" />
              <Text style={styles.loadingText}>Checking your data...</Text>
            </View>
          )}
        </View>

        {/* BACKGROUND WAVES */}

        <View pointerEvents="none" style={styles.waveBack} />

        <View pointerEvents="none" style={styles.waveFront} />
      </SafeAreaView>
    </View>
  );
}

// =========================================
// STYLES
// =========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  safeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  center: {
    width: "100%",
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  brandContainer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },

  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },

  brandName: {
    fontSize: 40,
    fontWeight: "700",
    color: "#062451",
  },

  tagline: {
    marginTop: 8,
    fontSize: 15,
    color: "#53657B",
    textAlign: "center",
  },

  loading: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 36,
  },

  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: "#53657B",
  },

  waveBack: {
    position: "absolute",
    bottom: -88,
    left: -90,
    right: -90,
    height: 165,
    borderTopLeftRadius: 180,
    borderTopRightRadius: 230,
    backgroundColor: "#E3F2FF",
  },

  waveFront: {
    position: "absolute",
    bottom: -125,
    left: -100,
    right: -100,
    height: 165,
    borderTopLeftRadius: 240,
    borderTopRightRadius: 180,
    backgroundColor: "#B7DEFF",
    opacity: 0.75,
  },
});
