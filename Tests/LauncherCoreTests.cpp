#include "Core/PathUtils.h"
#include "Core/ProjectCreator.h"
#include "Core/ProjectDescriptor.h"
#include "Core/ProjectRegistry.h"
#include "Core/ProjectTemplateCatalog.h"
#include "Core/ProjectValidator.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>

#include <algorithm>
#include <iostream>
#include <string_view>

using namespace Crown::Launcher;

namespace
{

int g_Failures = 0;

void Check(const bool condition, const char* message)
{
    if (!condition)
    {
        std::cerr << "FAIL: " << message << '\n';
        ++g_Failures;
    }
}

bool WriteFile(const std::filesystem::path& path, const QByteArray& content)
{
    QDir().mkpath(PathToQString(path.parent_path()));
    QFile file(PathToQString(path));
    return file.open(QIODevice::WriteOnly) && file.write(content) == content.size();
}

ProjectDescriptor MakeProject(
    const std::filesystem::path& root,
    const QString& name)
{
    std::filesystem::create_directories(root / "Assets");
    ProjectDescriptor descriptor;
    descriptor.projectId = QUuid::createUuid();
    descriptor.displayName = name;
    descriptor.root = root;
    descriptor.manifestPath = root / QStringToPath(name + QStringLiteral(".crownproject"));
    QString error;
    Check(WriteProjectDescriptor(descriptor, descriptor.manifestPath, &error),
          "project manifest should be writable");
    return descriptor;
}

void DescriptorAndValidationTest(const std::filesystem::path& root)
{
    const ProjectDescriptor created = MakeProject(root / "Unicode 项目", QStringLiteral("Unicode 项目"));
    const ProjectInspection inspection = InspectProject(created.root);
    Check(inspection.health == ProjectHealth::Ready, "valid Unicode project should be ready");
    Check(inspection.descriptor.has_value(), "valid project should load a descriptor");
    Check(inspection.descriptor && inspection.descriptor->displayName == QStringLiteral("Unicode 项目"),
          "display name should round trip as Unicode");

    const ProjectInspection missing = InspectProject(root / "missing");
    Check(missing.health == ProjectHealth::Missing, "missing project should report Missing");

    std::filesystem::create_directories(root / "invalid" / "Assets");
    const ProjectInspection invalid = InspectProject(root / "invalid");
    Check(invalid.health == ProjectHealth::Invalid, "project without manifest should be invalid");

    const std::filesystem::path duplicateRoot = root / "duplicate";
    MakeProject(duplicateRoot, QStringLiteral("First"));
    ProjectDescriptor second = MakeProject(duplicateRoot, QStringLiteral("Second"));
    (void)second;
    Check(InspectProject(duplicateRoot).health == ProjectHealth::Invalid,
          "project with duplicate manifests should be invalid");
}

void RegistryTest(const std::filesystem::path& root)
{
    const ProjectDescriptor descriptor = MakeProject(root / "RegistryProject", QStringLiteral("RegistryProject"));
    const std::filesystem::path registryPath = root / "config" / "projects.json";
    ProjectRegistry registry(registryPath);
    registry.AddOrUpdate(descriptor);
    Check(registry.SetPinned(descriptor.root, true), "registry should pin an existing record");
    Check(registry.MarkOpened(descriptor.root), "registry should mark an existing record opened");
    QString error;
    Check(registry.Save(&error), "registry should save atomically");

    ProjectRegistry restored(registryPath);
    Check(restored.Load(&error), "registry should load saved data");
    Check(restored.Records().size() == 1, "registry should restore one project");
    Check(restored.Records().front().pinned, "registry should restore pinned state");

    ProjectDescriptor moved = descriptor;
    moved.root = root / "MovedRegistryProject";
    moved.manifestPath = moved.root / "RegistryProject.crownproject";
    std::filesystem::create_directories(moved.root / "Assets");
    Check(WriteProjectDescriptor(moved, moved.manifestPath, &error),
          "moved project manifest should be writable");
    restored.AddOrUpdate(moved);
    Check(restored.Records().size() == 1,
          "registry should deduplicate a relocated project by projectId");
    Check(restored.Records().front().path == NormalizeAbsolutePath(moved.root),
          "registry should update the path for a relocated projectId");
    Check(restored.Remove(moved.root), "registry should remove the project record");
    Check(std::filesystem::exists(descriptor.root), "registry remove must not delete project files");

    Check(WriteFile(registryPath, QByteArrayLiteral("{broken")),
          "corrupt registry fixture should be writable");
    ProjectRegistry corrupt(registryPath);
    Check(!corrupt.Load(&error), "corrupt registry JSON should be rejected");
}

void CreatorTest(const std::filesystem::path& root)
{
    const std::filesystem::path templates = root / "Templates";
    const std::filesystem::path blank = templates / "Blank3D";
    const QJsonObject manifest {
        { QStringLiteral("id"), QStringLiteral("blank3d") },
        { QStringLiteral("displayName"), QStringLiteral("Blank 3D") },
        { QStringLiteral("description"), QStringLiteral("A compact Crown 3D project.") },
        { QStringLiteral("supportsScripting"), true },
        { QStringLiteral("directories"), QJsonArray { QStringLiteral("Assets"), QStringLiteral("Assets/Scripts"), QStringLiteral("ProjectSettings") } },
        { QStringLiteral("textFiles"), QJsonArray { QStringLiteral("ProjectSettings/BuildSettings.json") } },
    };
    Check(WriteFile(blank / "template.json", QJsonDocument(manifest).toJson()),
          "template manifest should be writable");
    Check(WriteFile(
              blank / "Files" / "ProjectSettings" / "BuildSettings.json",
              QByteArrayLiteral("{\"startupScene\":\"\",\"project\":\"{{PROJECT_NAME}}\"}")),
          "template content should be writable");

    const ProjectTemplateCatalogResult catalog = LoadProjectTemplateCatalog(templates);
    Check(catalog.error.isEmpty(), "template catalog should load");
    Check(catalog.templates.size() == 1, "template catalog should contain one template");
    if (catalog.templates.empty())
    {
        return;
    }

    const std::filesystem::path projects = root / "Created";
    std::filesystem::create_directories(projects);
    const ProjectCreateResult created = CreateProject({
        QStringLiteral("外部 Demo"),
        projects,
        catalog.templates.front(),
        true,
    });
    Check(created.error.isEmpty(), "project creation should succeed");
    Check(created.descriptor.has_value(), "project creation should return a descriptor");
    if (created.descriptor)
    {
        Check(InspectProject(created.descriptor->root).health == ProjectHealth::Ready,
              "created project should validate");
        Check(std::filesystem::exists(
                  created.descriptor->root / created.descriptor->scripting.projectFile),
              "created scripted project should contain its csproj");
    }

    const ProjectCreateResult traversal = CreateProject({
        QStringLiteral("../escape"), projects, catalog.templates.front(), false,
    });
    Check(!traversal.error.isEmpty(), "unsafe project name should be rejected");
}

} // namespace

int main(int argc, char** argv)
{
    QCoreApplication application(argc, argv);
    QCoreApplication::setOrganizationName(QStringLiteral("CrownEngine"));
    QCoreApplication::setApplicationName(QStringLiteral("CrownLauncher"));
    if (argc == 3 &&
        (std::string_view(argv[1]) == "--register-project" ||
         std::string_view(argv[1]) == "--unregister-project"))
    {
        ProjectRegistry registry;
        QString error;
        if (!registry.Load(&error))
        {
            std::cerr << error.toStdString() << '\n';
            return 5;
        }
        const std::filesystem::path projectPath =
            QStringToPath(QString::fromUtf8(argv[2]));
        if (std::string_view(argv[1]) == "--register-project")
        {
            const ProjectInspection inspection = InspectProject(projectPath);
            if (inspection.health != ProjectHealth::Ready || !inspection.descriptor)
            {
                std::cerr << inspection.message.toStdString() << '\n';
                return 4;
            }
            registry.AddOrUpdate(*inspection.descriptor);
        }
        else
        {
            registry.Remove(projectPath);
        }
        if (!registry.Save(&error))
        {
            std::cerr << error.toStdString() << '\n';
            return 6;
        }
        return 0;
    }
    if (argc == 6 && std::string_view(argv[1]) == "--materialize-template")
    {
        const ProjectTemplateCatalogResult catalog =
            LoadProjectTemplateCatalog(QStringToPath(QString::fromUtf8(argv[2])));
        const auto selected = std::find_if(
            catalog.templates.begin(), catalog.templates.end(),
            [&argv](const ProjectTemplateInfo& entry)
            { return entry.id == QString::fromUtf8(argv[4]); });
        if (!catalog.error.isEmpty() || selected == catalog.templates.end())
        {
            std::cerr << catalog.error.toStdString() << '\n';
            return 2;
        }
        const ProjectCreateResult created = CreateProject({
            QString::fromUtf8(argv[5]),
            QStringToPath(QString::fromUtf8(argv[3])),
            *selected,
            true,
        });
        if (!created.descriptor)
        {
            std::cerr << created.error.toStdString() << '\n';
            return 3;
        }
        std::cout << "projectRoot="
                  << PathToQString(created.descriptor->root).toStdString()
                  << '\n';
        return 0;
    }
    QTemporaryDir temporary;
    Check(temporary.isValid(), "temporary test directory should be available");
    if (!temporary.isValid())
    {
        return 1;
    }

    const std::filesystem::path root = QStringToPath(temporary.path());
    DescriptorAndValidationTest(root / "descriptor");
    RegistryTest(root / "registry");
    CreatorTest(root / "creator");

    if (g_Failures == 0)
    {
        std::cout << "CrownLauncherCoreTests passed\n";
    }
    return g_Failures == 0 ? 0 : 1;
}
