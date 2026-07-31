cmake_minimum_required(VERSION 3.28)

project(CrownLauncher
    VERSION 0.1.0
    DESCRIPTION "Project manager and launcher for CrownEditor"
    LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

set(CROWN_QT_ROOT "" CACHE PATH "Qt SDK prefix used to build CrownLauncher")
if(NOT CROWN_QT_ROOT AND DEFINED ENV{CROWN_QT_ROOT})
    set(CROWN_QT_ROOT "$ENV{CROWN_QT_ROOT}")
endif()
if(CROWN_QT_ROOT)
    list(PREPEND CMAKE_PREFIX_PATH "${CROWN_QT_ROOT}")
endif()

find_package(Qt6 6.8 REQUIRED COMPONENTS
    Core
    Gui
    Network
    Quick
    QuickControls2
    Widgets)

qt_standard_project_setup(REQUIRES 6.8)

add_library(CrownLauncherCore STATIC
    Source/Core/EditorInstallResolver.cpp
    Source/Core/EditorInstallResolver.h
    Source/Core/PathUtils.cpp
    Source/Core/PathUtils.h
    Source/Core/ProjectCreator.cpp
    Source/Core/ProjectCreator.h
    Source/Core/ProjectDescriptor.cpp
    Source/Core/ProjectDescriptor.h
    Source/Core/ProjectRegistry.cpp
    Source/Core/ProjectRegistry.h
    Source/Core/ProjectTemplateCatalog.cpp
    Source/Core/ProjectTemplateCatalog.h
    Source/Core/ProjectValidator.cpp
    Source/Core/ProjectValidator.h)
target_include_directories(CrownLauncherCore PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/Source")
target_link_libraries(CrownLauncherCore PUBLIC Qt6::Core)

if(MSVC)
    target_compile_options(CrownLauncherCore PRIVATE /W4 /permissive- /utf-8)
else()
    target_compile_options(CrownLauncherCore PRIVATE -Wall -Wextra -Wpedantic)
endif()

qt_add_executable(CrownLauncher
    Source/Qt/CrownLauncherMain.cpp
    Source/Qt/LauncherController.cpp
    Source/Qt/LauncherController.h)
target_include_directories(CrownLauncher PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/Source")
target_link_libraries(CrownLauncher PRIVATE
    CrownLauncherCore
    Qt6::Gui
    Qt6::Network
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Widgets)

qt_add_qml_module(CrownLauncher
    URI Crown.Launcher
    VERSION 1.0
    QML_FILES
        Source/Qt/Quick/Launcher.qml)

set_target_properties(CrownLauncher PROPERTIES
    WIN32_EXECUTABLE TRUE
    OUTPUT_NAME CrownLauncher)

if(WIN32)
    find_program(CROWN_WINDEPLOYQT_EXECUTABLE
        NAMES windeployqt
        HINTS "${CROWN_QT_ROOT}/bin"
        REQUIRED)
    add_custom_command(TARGET CrownLauncher POST_BUILD
        COMMAND "${CROWN_WINDEPLOYQT_EXECUTABLE}"
            --no-translations
            --no-system-d3d-compiler
            --qmldir "${CMAKE_CURRENT_SOURCE_DIR}/Source/Qt/Quick"
            "$<TARGET_FILE:CrownLauncher>"
        COMMENT "Deploying the Qt runtime for CrownLauncher")
endif()

if(BUILD_TESTING)
    add_subdirectory(Tests)
endif()
