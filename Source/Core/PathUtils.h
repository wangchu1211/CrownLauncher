#pragma once

#include <QString>

#include <filesystem>

namespace Crown::Launcher
{

QString PathToQString(const std::filesystem::path& path);
std::filesystem::path QStringToPath(const QString& path);
std::filesystem::path NormalizeAbsolutePath(const std::filesystem::path& path);
bool IsSafeRelativePath(const std::filesystem::path& path);
bool IsPathWithin(
    const std::filesystem::path& child,
    const std::filesystem::path& parent);

} // namespace Crown::Launcher

