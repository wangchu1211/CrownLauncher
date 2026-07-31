#include "Core/PathUtils.h"

#include <system_error>

namespace Crown::Launcher
{

QString PathToQString(const std::filesystem::path& path)
{
#if defined(_WIN32)
    return QString::fromStdWString(path.wstring());
#else
    const std::u8string utf8 = path.u8string();
    return QString::fromUtf8(
        reinterpret_cast<const char*>(utf8.data()),
        static_cast<qsizetype>(utf8.size()));
#endif
}

std::filesystem::path QStringToPath(const QString& path)
{
#if defined(_WIN32)
    return std::filesystem::path(path.toStdWString());
#else
    return std::filesystem::path(path.toUtf8().constData());
#endif
}

std::filesystem::path NormalizeAbsolutePath(const std::filesystem::path& path)
{
    if (path.empty())
    {
        return {};
    }

    std::error_code error;
    const std::filesystem::path absolute = path.is_absolute()
        ? path
        : std::filesystem::absolute(path, error);
    if (error)
    {
        return path.lexically_normal();
    }

    const std::filesystem::path canonical =
        std::filesystem::weakly_canonical(absolute, error);
    return error ? absolute.lexically_normal() : canonical;
}

bool IsSafeRelativePath(const std::filesystem::path& path)
{
    if (path.empty() || path.is_absolute() || path.has_root_name() ||
        path.has_root_directory())
    {
        return false;
    }

    const std::filesystem::path normalized = path.lexically_normal();
    for (const std::filesystem::path& part : normalized)
    {
        if (part == "..")
        {
            return false;
        }
    }
    return normalized != ".";
}

bool IsPathWithin(
    const std::filesystem::path& child,
    const std::filesystem::path& parent)
{
    const std::filesystem::path normalizedChild = NormalizeAbsolutePath(child);
    const std::filesystem::path normalizedParent = NormalizeAbsolutePath(parent);
    auto childPart = normalizedChild.begin();
    for (auto parentPart = normalizedParent.begin();
         parentPart != normalizedParent.end();
         ++parentPart, ++childPart)
    {
        if (childPart == normalizedChild.end() || *childPart != *parentPart)
        {
            return false;
        }
    }
    return true;
}

} // namespace Crown::Launcher
