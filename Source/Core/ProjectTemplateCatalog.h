#pragma once

#include <QString>

#include <filesystem>
#include <vector>

namespace Crown::Launcher
{

struct ProjectTemplateInfo
{
    QString id;
    QString displayName;
    QString description;
    bool supportsScripting = false;
    std::filesystem::path root;
    std::vector<std::filesystem::path> directories;
    std::vector<std::filesystem::path> textFiles;
};

struct ProjectTemplateCatalogResult
{
    std::vector<ProjectTemplateInfo> templates;
    QString error;
};

ProjectTemplateCatalogResult LoadProjectTemplateCatalog(
    const std::filesystem::path& templatesRoot);

} // namespace Crown::Launcher

