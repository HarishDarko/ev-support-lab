plugins {
    // Lets Gradle download the JDK named in the toolchain (Java 25) when it is not installed.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "ev-support-lab"

include("lab")
