allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// nfc_manager 3.5.1 fixa compileSdkVersion 31 no seu próprio build.gradle,
// abaixo do exigido pelas dependências transitivas dele (androidx.fragment
// 1.7.1 etc. exigem 34+). Isso quebra :nfc_manager:checkDebugAarMetadata.
// Força compileSdk 36 em todos os subprojetos (plugins nativos incluídos)
// até o pacote publicar uma correção. Precisa rodar ANTES de
// evaluationDependsOn(":app") abaixo, senão ":app" já foi avaliado quando
// este afterEvaluate tenta se registrar nele.
subprojects {
    afterEvaluate {
        if (project.hasProperty("android")) {
            val androidExt = project.extensions.findByName("android")
            if (androidExt is com.android.build.gradle.BaseExtension) {
                androidExt.compileSdkVersion(36)
            }
        }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
