#include "Core/ProjectValidator.h"

#include "Core/PathUtils.h"

#include <QFileInfo>

namespace Crown::Launcher
{

ProjectInspection InspectProject(const std::filesystem::path& projectRoot)
{
    ProjectInspection inspection;
    inspection.root = NormalizeAbsolutePath(projectRoot);
    const QFileInfo rootInfo(PathToQString(inspection.root));
    if (!rootInfo.exists())
    {
        inspection.health = ProjectHealth::Missing;
        inspection.message = QStringLiteral("The registered project location is missing.");
        return inspection;
    }
    if (!rootInfo.isDir() || !rootInfo.isReadable())
    {
        inspection.health = ProjectHealth::Invalid;
        inspection.message = QStringLiteral("The project root is not a readable directory.");
        return inspection;
    }

    ProjectDescriptorLoadResult loaded = LoadProjectDescriptor(inspection.root);
    if (!loaded.descriptor.has_value())
    {
        inspection.health = ProjectHealth::Invalid;
        inspection.message = loaded.error;
        return inspection;
    }

    const QFileInfo assets(PathToQString(inspection.root / "Assets"));
    if (!assets.exists() || !assets.isDir())
    {
        inspection.health = ProjectHealth::Invalid;
        inspection.message = QStringLiteral("The project does not contain an Assets directory.");
        return inspection;
    }

    if (loaded.descriptor->scripting.enabled)
    {
        const std::filesystem::path projectFile =
            inspection.root / loaded.descriptor->scripting.projectFile;
        if (!IsPathWithin(projectFile, inspection.root))
        {
            inspection.health = ProjectHealth::Invalid;
            inspection.message = QStringLiteral("The script project escapes the project root.");
            return inspection;
        }
        const QFileInfo projectFileInfo(PathToQString(projectFile));
        if (!projectFileInfo.exists() || !projectFileInfo.isFile() ||
            !projectFileInfo.isReadable())
        {
            inspection.health = ProjectHealth::Invalid;
            inspection.message = QStringLiteral(
                "The configured C# project file is missing or unreadable.");
            return inspection;
        }
    }

    inspection.health = ProjectHealth::Ready;
    inspection.descriptor = std::move(loaded.descriptor);
    return inspection;
}

QString ProjectHealthName(const ProjectHealth health)
{
    switch (health)
    {
    case ProjectHealth::Ready: return QStringLiteral("Ready");
    case ProjectHealth::Missing: return QStringLiteral("Missing");
    case ProjectHealth::Invalid: return QStringLiteral("Invalid");
    }
    return QStringLiteral("Invalid");
}

} // namespace Crown::Launcher
