add_executable(CrownLauncherCoreTests
    LauncherCoreTests.cpp)
target_link_libraries(CrownLauncherCoreTests PRIVATE
    CrownLauncherCore
    Qt6::Core)

if(MSVC)
    target_compile_options(CrownLauncherCoreTests PRIVATE /W4 /permissive- /utf-8)
else()
    target_compile_options(CrownLauncherCoreTests PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_test(NAME CrownLauncherCoreTests COMMAND CrownLauncherCoreTests)

