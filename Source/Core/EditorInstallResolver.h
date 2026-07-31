#pragma once

#include <QString>

#include <filesystem>
#include <optional>

namespace Crown::Launcher
{

struct EditorInstall
{
    std::filesystem::path root;
    std::filesystem::path executable;
    std::filesystem::path templatesRoot;
    QString displayVersion;
    QString error;

    bool IsValid() const { return error.isEmpty() && !executable.empty(); }
};

class IEditorInstallResolver
{
public:
    virtual ~IEditorInstallResolver() = default;
    virtual EditorInstall Resolve(
        const std::optional<QString>& requestedVersion) const = 0;
};

class BundledEditorInstallResolver final : public IEditorInstallResolver
{
public:
    BundledEditorInstallResolver(
        std::filesystem::path applicationDirectory,
        std::filesystem::path configuredExecutable = {});

    EditorInstall Resolve(
        const std::optional<QString>& requestedVersion) const override;

private:
    std::filesystem::path m_ApplicationDirectory;
    std::filesystem::path m_ConfiguredExecutable;
};

} // namespace Crown::Launcher

