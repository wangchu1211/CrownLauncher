#pragma once

#include "Core/ProjectDescriptor.h"
#include "Core/ProjectSampleCatalog.h"

#include <QString>

#include <filesystem>
#include <optional>

namespace Crown::Launcher
{

struct ProjectSampleCreateRequest
{
    QString displayName;
    std::filesystem::path parentDirectory;
    ProjectSampleInfo sample;
};

struct ProjectSampleCreateResult
{
    std::optional<ProjectDescriptor> descriptor;
    QString error;
};

ProjectSampleCreateResult CreateProjectFromSample(
    const ProjectSampleCreateRequest& request);

} // namespace Crown::Launcher
