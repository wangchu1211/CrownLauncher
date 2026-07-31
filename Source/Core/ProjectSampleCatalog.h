#pragma once

#include "Core/ProjectDescriptor.h"

#include <QString>

#include <filesystem>
#include <vector>

namespace Crown::Launcher
{

struct ProjectSampleInfo
{
    QString id;
    QString displayName;
    QString description;
    QString category;
    std::filesystem::path root;
    ProjectDescriptor sourceProject;
};

struct ProjectSampleCatalogResult
{
    std::vector<ProjectSampleInfo> samples;
    QString error;
};

ProjectSampleCatalogResult LoadProjectSampleCatalog(
    const std::filesystem::path& samplesRoot);

} // namespace Crown::Launcher
