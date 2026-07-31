#pragma once

#include "Core/ProjectDescriptor.h"
#include "Core/ProjectTemplateCatalog.h"

#include <QString>

#include <filesystem>
#include <optional>

namespace Crown::Launcher
{

struct ProjectCreateRequest
{
    QString displayName;
    std::filesystem::path parentDirectory;
    ProjectTemplateInfo projectTemplate;
    bool enableScripting = false;
};

struct ProjectCreateResult
{
    std::optional<ProjectDescriptor> descriptor;
    QString error;
};

ProjectCreateResult CreateProject(const ProjectCreateRequest& request);

} // namespace Crown::Launcher

