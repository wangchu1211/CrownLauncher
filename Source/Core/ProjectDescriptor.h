#pragma once

#include <QString>
#include <QUuid>

#include <filesystem>
#include <optional>

namespace Crown::Launcher
{

struct ProjectScriptingConfig
{
    bool enabled = false;
    std::filesystem::path projectFile;
    QString assemblyName;
};

struct ProjectDescriptor
{
    static constexpr int kCurrentSchemaVersion = 1;

    int schemaVersion = kCurrentSchemaVersion;
    QUuid projectId;
    QString displayName;
    std::optional<QString> editorVersion;
    ProjectScriptingConfig scripting;
    std::filesystem::path root;
    std::filesystem::path manifestPath;
};

struct ProjectDescriptorLoadResult
{
    std::optional<ProjectDescriptor> descriptor;
    QString error;
};

ProjectDescriptorLoadResult LoadProjectDescriptor(
    const std::filesystem::path& projectRootOrManifest);
bool WriteProjectDescriptor(
    const ProjectDescriptor& descriptor,
    const std::filesystem::path& manifestPath,
    QString* outError = nullptr);

} // namespace Crown::Launcher

