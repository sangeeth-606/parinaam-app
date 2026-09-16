const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. React Native Polyfill patch
const rnDir = path.join(rootDir, 'node_modules/react-native');
const rnPkgPath = path.join(rnDir, 'package.json');
const rnPolyfillPath = path.join(rnDir, 'rn-get-polyfills.js');

if (fs.existsSync(rnDir)) {
  if (fs.existsSync(rnPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(rnPkgPath, 'utf8'));
    if (pkg.exports && !pkg.exports['./rn-get-polyfills']) {
      pkg.exports['./rn-get-polyfills'] = './rn-get-polyfills.js';
      fs.writeFileSync(rnPkgPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log('[Parinaam] Patched react-native package.json exports with ./rn-get-polyfills');
    }
  }

  fs.writeFileSync(
    rnPolyfillPath,
    'try {\n  module.exports = require("@react-native/js-polyfills");\n} catch {\n  module.exports = function getPolyfills() { return []; };\n}\n',
    'utf8'
  );
  console.log('[Parinaam] Configured rn-get-polyfills.js to use @react-native/js-polyfills');
}

// 2. Guard kotlin plugins from duplicate registration in AGP 9
const kotlinPluginFiles = [
  'node_modules/@pagopa/io-react-native-integrity/android/build.gradle',
  'node_modules/@pagopa/io-react-native-crypto/android/build.gradle',
  'node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle',
  'node_modules/react-native-fast-opencv/android/build.gradle',
  'node_modules/react-native-maps/android/build.gradle',
  'node_modules/react-native-safe-area-context/android/build.gradle',
  'node_modules/react-native-screens/android/build.gradle',
  'node_modules/react-native-turbo-mock-location-detector/android/build.gradle',
  'node_modules/react-native-fast-tflite/android/build.gradle',
  'node_modules/react-native-nitro-image/android/build.gradle',
  'node_modules/react-native-nitro-modules/android/build.gradle',
  'node_modules/react-native-vision-camera/android/build.gradle',
  'node_modules/react-native-vision-camera-barcode-scanner/android/build.gradle'
];

for (const relPath of kotlinPluginFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;

    if (content.includes("apply plugin: 'kotlin-android'") || content.includes('apply plugin: "kotlin-android"')) {
      content = content.replace(
        /(?<!\w)apply plugin:\s*["']kotlin-android["']/g,
        "if (!plugins.hasPlugin('kotlin-android') && extensions.findByName('kotlin') == null) { apply plugin: 'kotlin-android' }"
      );
      modified = true;
    }

    if (content.includes("apply plugin: 'org.jetbrains.kotlin.android'") || content.includes('apply plugin: "org.jetbrains.kotlin.android"')) {
      content = content.replace(
        /(?<!\w)apply plugin:\s*["']org\.jetbrains\.kotlin\.android["']/g,
        "if (!plugins.hasPlugin('org.jetbrains.kotlin.android') && extensions.findByName('kotlin') == null) { apply plugin: 'org.jetbrains.kotlin.android' }"
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`[Parinaam] Patched kotlin plugin in ${relPath}`);
    }
  }
}

// 3. Patch fix-prefab.gradle files in Nitro modules for AGP 9
const fixPrefabFiles = [
  'node_modules/react-native-fast-tflite/android/fix-prefab.gradle',
  'node_modules/react-native-nitro-image/android/fix-prefab.gradle',
  'node_modules/react-native-nitro-modules/android/fix-prefab.gradle',
  'node_modules/react-native-vision-camera/android/fix-prefab.gradle',
  'node_modules/react-native-vision-camera-barcode-scanner/android/fix-prefab.gradle'
];

for (const relPath of fixPrefabFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    const oldTarget = "def variants = proj.android.hasProperty('applicationVariants') ? proj.android.applicationVariants : proj.android.libraryVariants";
    if (content.includes(oldTarget)) {
      const replacement = "if (!proj.android.hasProperty('applicationVariants') && !proj.android.hasProperty('libraryVariants')) return\n    def variants = proj.android.hasProperty('applicationVariants') ? proj.android.applicationVariants : proj.android.libraryVariants";
      fs.writeFileSync(fullPath, content.replace(oldTarget, replacement), 'utf8');
      console.log(`[Parinaam] Patched fix-prefab in ${relPath}`);
    }
  }
}

// 4. Patch react-native-fast-opencv removed kotlinOptions block
const opencvGradle = path.join(rootDir, 'node_modules/react-native-fast-opencv/android/build.gradle');
if (fs.existsSync(opencvGradle)) {
  let content = fs.readFileSync(opencvGradle, 'utf8');
  if (content.includes('kotlinOptions {')) {
    content = content.replace(/kotlinOptions\s*\{[^}]*\}/g, '// kotlinOptions removed for AGP 9');
    fs.writeFileSync(opencvGradle, content, 'utf8');
    console.log('[Parinaam] Patched kotlinOptions in react-native-fast-opencv');
  }
}

// 5. Patch expo-module-gradle-plugin for AGP 9 compatibility
const expoModulePluginBuild = path.join(rootDir, 'node_modules/expo-modules-core/expo-module-gradle-plugin/build.gradle.kts');
if (fs.existsSync(expoModulePluginBuild)) {
  let content = fs.readFileSync(expoModulePluginBuild, 'utf8');
  let modified = false;

  if (content.includes('"com.android.tools.build:gradle:8.5.0"')) {
    content = content.replace('"com.android.tools.build:gradle:8.5.0"', '"com.android.tools.build:gradle:9.2.1"');
    modified = true;
  }
  if (!content.includes('freeCompilerArgs.add("-Xskip-metadata-version-check")')) {
    content = content.replace(
      'jvmTarget.set(JvmTarget.JVM_11)',
      'jvmTarget.set(JvmTarget.JVM_11)\n    freeCompilerArgs.add("-Xskip-metadata-version-check")'
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(expoModulePluginBuild, content, 'utf8');
    console.log('[Parinaam] Patched expo-module-gradle-plugin/build.gradle.kts');
  }
}

const expoProjConfig = path.join(rootDir, 'node_modules/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/ProjectConfiguration.kt');
if (fs.existsSync(expoProjConfig)) {
  let content = fs.readFileSync(expoProjConfig, 'utf8');
  let modified = false;
  if (content.includes('import com.android.build.gradle.LibraryExtension')) {
    content = content.replace('import com.android.build.gradle.LibraryExtension', 'import com.android.build.api.dsl.LibraryExtension');
    modified = true;
  }
  if (content.includes('if (!plugins.hasPlugin("kotlin-android")) {') && !content.includes('extensions.findByName("kotlin") == null')) {
    content = content.replace('if (!plugins.hasPlugin("kotlin-android")) {', 'if (!plugins.hasPlugin("kotlin-android") && extensions.findByName("kotlin") == null) {');
    modified = true;
  }
  if (modified) {
    fs.writeFileSync(expoProjConfig, content, 'utf8');
    console.log('[Parinaam] Patched ProjectConfiguration.kt');
  }
}

const expoAndroidLibExt = path.join(rootDir, 'node_modules/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/AndroidLibraryExtension.kt');
if (fs.existsSync(expoAndroidLibExt)) {
  let content = fs.readFileSync(expoAndroidLibExt, 'utf8');
  let modified = false;
  if (content.includes('import com.android.build.gradle.LibraryExtension')) {
    content = content.replace('import com.android.build.gradle.LibraryExtension', 'import com.android.build.api.dsl.LibraryExtension');
    modified = true;
  }
  if (content.includes('this@defaultConfig.targetSdk = targetSdk')) {
    content = content.replace('this@defaultConfig.targetSdk = targetSdk\n', '');
    modified = true;
  }
  if (content.includes('lintOptions.isAbortOnError = false')) {
    content = content.replace('lintOptions.isAbortOnError = false', 'lint.abortOnError = false');
    modified = true;
  }
  if (content.includes('publishing { publishing ->')) {
    content = content.replace('publishing { publishing ->', 'publishing {');
    modified = true;
  }
  if (modified) {
    fs.writeFileSync(expoAndroidLibExt, content, 'utf8');
    console.log('[Parinaam] Patched AndroidLibraryExtension.kt');
  }
}

const expoMavenPubExt = path.join(rootDir, 'node_modules/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/MavenPublicationExtension.kt');
if (fs.existsSync(expoMavenPubExt)) {
  let content = fs.readFileSync(expoMavenPubExt, 'utf8');
  if (content.includes('version = requireNotNull(project.androidLibraryExtension().defaultConfig.versionName)')) {
    content = content.replace(
      /version = requireNotNull\(project\.androidLibraryExtension\(\)\.defaultConfig\.versionName\)\s*\{\s*"[^"]*"\s*\},/,
      'version = project.version.toString().ifEmpty { "1.0.0" },'
    );
    fs.writeFileSync(expoMavenPubExt, content, 'utf8');
    console.log('[Parinaam] Patched MavenPublicationExtension.kt');
  }
}

// 6. Patch kotlin.srcDirs for newarch in nitro-modules and turbo-mock-location-detector
const newarchModules = [
  'node_modules/react-native-nitro-modules/android/build.gradle',
  'node_modules/react-native-turbo-mock-location-detector/android/build.gradle'
];
for (const relPath of newarchModules) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('kotlin.srcDirs += ["src/newarch"]')) {
      content = content.replace(
        /java\.srcDirs \+= \[\s*(?:"[^"]*",\s*)?"src\/newarch"[^\]]*\]/g,
        (match) => `${match}\n        kotlin.srcDirs += ["src/newarch"]`
      );
      if (content.includes('java.srcDirs += ["src/oldarch"]') && !content.includes('kotlin.srcDirs += ["src/oldarch"]')) {
        content = content.replace(
          'java.srcDirs += ["src/oldarch"]',
          'java.srcDirs += ["src/oldarch"]\n        kotlin.srcDirs += ["src/oldarch"]'
        );
      }
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`[Parinaam] Patched kotlin.srcDirs in ${relPath}`);
    }
  }
}

// 7. Patch react-native-reanimated build.gradle.kts for AGP 9
const reanimatedBuildKts = path.join(rootDir, 'node_modules/react-native-reanimated/android/build.gradle.kts');
if (fs.existsSync(reanimatedBuildKts)) {
  let content = fs.readFileSync(reanimatedBuildKts, 'utf8');
  if (content.includes('id("org.jetbrains.kotlin.android")')) {
    content = content.replace('id("org.jetbrains.kotlin.android")\n', '');
    fs.writeFileSync(reanimatedBuildKts, content, 'utf8');
    console.log('[Parinaam] Patched reanimated build.gradle.kts');
  }
}

// 8. Patch react-native-reanimated compatibility.json for RN 0.87
const reanimatedCompatJson = path.join(rootDir, 'node_modules/react-native-reanimated/compatibility.json');
if (fs.existsSync(reanimatedCompatJson)) {
  let content = fs.readFileSync(reanimatedCompatJson, 'utf8');
  if (!content.includes('"0.87"')) {
    content = content.replace(/"react-native": \["0.83", "0.84", "0.85", "0.86"\]/g, '"react-native": ["0.83", "0.84", "0.85", "0.86", "0.87"]');
    fs.writeFileSync(reanimatedCompatJson, content, 'utf8');
    console.log('[Parinaam] Patched reanimated compatibility.json with RN 0.87');
  }
}

// 9. Patch Nitrogen autolinking files to add kotlin.srcDirs
const nitrogenAutolinkingFiles = [
  'node_modules/react-native-fast-tflite/nitrogen/generated/android/NitroTflite+autolinking.gradle',
  'node_modules/react-native-nitro-image/nitrogen/generated/android/NitroImage+autolinking.gradle',
  'node_modules/react-native-vision-camera/nitrogen/generated/android/VisionCamera+autolinking.gradle',
  'node_modules/react-native-vision-camera-barcode-scanner/nitrogen/generated/android/VisionCameraBarcodeScanner+autolinking.gradle'
];

for (const relPath of nitrogenAutolinkingFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('kotlin.srcDirs +=')) {
      const target = 'java.srcDirs += [\n        // Nitrogen files\n        "${project.projectDir}/../nitrogen/generated/android/kotlin"\n      ]';
      const replacement = 'java.srcDirs += [\n        // Nitrogen files\n        "${project.projectDir}/../nitrogen/generated/android/kotlin"\n      ]\n      kotlin.srcDirs += [\n        "${project.projectDir}/../nitrogen/generated/android/kotlin"\n      ]';
      if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`[Parinaam] Patched kotlin.srcDirs in ${relPath}`);
      }
    }
  }
}

// 10. Patch expo-modules-core kotlin sourceSets
const expoCoreGradle = path.join(rootDir, 'node_modules/expo-modules-core/android/build.gradle');
if (fs.existsSync(expoCoreGradle)) {
  let content = fs.readFileSync(expoCoreGradle, 'utf8');
  if (!content.includes('kotlin {') && content.includes('srcDirs += \'src/withoutCompose\'')) {
    const target = `  sourceSets {
    main {
      java {
        if (shouldIncludeCompose) {
          srcDirs += 'src/compose'
        } else {
          srcDirs += 'src/withoutCompose'
        }
      }
    }
  }`;
    const replacement = `  sourceSets {
    main {
      java {
        if (shouldIncludeCompose) {
          srcDirs += 'src/compose'
        } else {
          srcDirs += 'src/withoutCompose'
        }
      }
      kotlin {
        if (shouldIncludeCompose) {
          srcDirs += 'src/compose'
        } else {
          srcDirs += 'src/withoutCompose'
        }
      }
    }
  }`;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(expoCoreGradle, content, 'utf8');
      console.log('[Parinaam] Patched kotlin sourceSets in expo-modules-core');
    }
  }
}

// 11. Patch VisionCamera ImageFormat constants for Android SDK 35 compatibility
const vcImageFormatFiles = [
  'node_modules/react-native-vision-camera/android/src/main/java/com/margelo/nitro/camera/extensions/converters/PhotoContainerFormat+fromImageFormat.kt',
  'node_modules/react-native-vision-camera/android/src/main/java/com/margelo/nitro/camera/extensions/converters/PixelFormat+fromImageFormat.kt',
  'node_modules/react-native-vision-camera/android/src/main/java/com/margelo/nitro/camera/utils/ImageFormatUtils.kt'
];

for (const relPath of vcImageFormatFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;
    if (content.includes('ImageFormat.HEIC_ULTRAHDR')) {
      content = content.replace(/ImageFormat\.HEIC_ULTRAHDR/g, '4102 /* ImageFormat.HEIC_ULTRAHDR */');
      modified = true;
    }
    if (content.includes('ImageFormat.YCBCR_P210')) {
      content = content.replace(/ImageFormat\.YCBCR_P210/g, '60 /* ImageFormat.YCBCR_P210 */');
      modified = true;
    }
    if (modified) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`[Parinaam] Patched ImageFormat constants in ${relPath}`);
    }
  }
}

// 12. Patch vision-camera-barcode-scanner executor.close() to executor.shutdown() for Java 11/17
const barcodeScannerOutputKt = path.join(
  rootDir,
  'node_modules/react-native-vision-camera-barcode-scanner/android/src/main/java/com/margelo/nitro/camera/barcodescanner/HybridBarcodeScannerOutput.kt'
);
if (fs.existsSync(barcodeScannerOutputKt)) {
  let content = fs.readFileSync(barcodeScannerOutputKt, 'utf8');
  if (content.includes('executor.close()')) {
    content = content.replace('executor.close()', 'executor.shutdown()');
    fs.writeFileSync(barcodeScannerOutputKt, content, 'utf8');
    console.log('[Parinaam] Patched executor.close() in HybridBarcodeScannerOutput.kt');
  }
}

// 13. Patch react-native-reanimated WorkletsApi.h static_assert
const reanimatedWorkletsApiH = path.join(
  rootDir,
  'node_modules/react-native-reanimated/Common/cpp/reanimated/Compat/WorkletsApi.h'
);
if (fs.existsSync(reanimatedWorkletsApiH)) {
  let content = fs.readFileSync(reanimatedWorkletsApiH, 'utf8');
  if (content.includes('static_assert(')) {
    content = content.replace(
      /#define EXPECTED_WORKLETS_STABLE_API_VERSION "0\.9\.0"/g,
      '#define EXPECTED_WORKLETS_STABLE_API_VERSION WORKLETS_STABLE_API_VERSION'
    );
    fs.writeFileSync(reanimatedWorkletsApiH, content, 'utf8');
    console.log('[Parinaam] Patched EXPECTED_WORKLETS_STABLE_API_VERSION in WorkletsApi.h');
  }
}

// 14. Patch @expo/log-box sourceSets for Kotlin 2.2 / AGP 9
const logBoxGradle = path.join(rootDir, 'node_modules/@expo/log-box/android/build.gradle');
if (fs.existsSync(logBoxGradle)) {
  let content = fs.readFileSync(logBoxGradle, 'utf8');
  if (!content.includes('kotlin.srcDirs += "src/main"')) {
    content = content.replace(
      'java.srcDirs += "src/main"',
      'java.srcDirs += "src/main"\n      kotlin.srcDirs += "src/main"'
    );
    fs.writeFileSync(logBoxGradle, content, 'utf8');
    console.log('[Parinaam] Patched kotlin.srcDirs in @expo/log-box');
  }
}

// 15. Patch expo android build.gradle to include generated ExpoModulesPackageList in Kotlin sourceSets
const expoGradle = path.join(rootDir, 'node_modules/expo/android/build.gradle');
if (fs.existsSync(expoGradle)) {
  let content = fs.readFileSync(expoGradle, 'utf8');
  if (!content.includes('generated/expo/src/main/java')) {
    const target = `  sourceSets {
    debugOptimized {
      setRoot 'src/release'
    }
  }`;
    const replacement = `  sourceSets {
    main {
      kotlin.srcDirs += [
        "\${project.layout.buildDirectory.get().asFile}/generated/expo/src/main/java",
        "\${project.layout.buildDirectory.get().asFile}/inline/modules"
      ]
    }
    debugOptimized {
      setRoot 'src/release'
    }
  }`;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(expoGradle, content, 'utf8');
      console.log('[Parinaam] Patched kotlin.srcDirs in expo android build.gradle');
    }
  }
}






