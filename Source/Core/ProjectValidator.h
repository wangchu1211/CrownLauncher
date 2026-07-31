#pragma once

#include "Core/ProjectDescriptor.h"

#include <QString>

#include <filesystem>
#include <optional>

namespace Crown::Launcher
{

enum class ProjectHealth
{
    Ready,
    Missing,
    Invalid,
};

struct ProjectInspection
{
    ProjectHealth health = ProjectHealth::Invalid;
    std::filesystem::path root;
    std::optional<ProjectDescriptor> descriptor;
    QString message;
};

ProjectInspection InspectProject(const std::filesystem::path& projectRoot);
QString ProjectHealthName(ProjectHealth health);

} // namespace Crown::Launcher

