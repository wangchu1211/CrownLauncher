#include "Core/ProjectCreator.h"

#include "Core/PathUtils.h"
#include "Core/ProjectValidator.h"

#include <QByteArray>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QSaveFile>

#include <array>
#include <system_error>

namespace Crown::Launcher
{
namespace
{

bool IsValidProjectName(const QString& value)
{
    const QString name = value.trimmed();
    if (name.isEmpty() || name == QStringLiteral(".") || name == QStringLiteral(".."))
    {
        return false;
    }
    static constexpr std::array<QChar, 9> invalid = {
        QChar('<'), QChar('>'), QChar(':'), QChar('"'), QChar('/'),
        QChar('\\'), QChar('|'), QChar('?'), QChar('*'),
    };
    for (const QChar character : invalid)
    {
        if (name.contains(character))
        {
            return false;
        }
    }
    return !name.endsWith(QChar(' ')) && !name.endsWith(QChar('.'));
}

bool CopyTemplateTree(
    const ProjectTemplateInfo& projectTemplate,
    const std::filesystem::path& stagingRoot,
    QString* outError)
{
    const std::filesystem::path filesRoot = projectTemplate.root / "Files";
    std::error_code error;
    if (!std::filesystem::exists(filesRoot, error))
    {
        return true;
    }

    for (std::filesystem::recursive_directory_iterator iterator(
             filesRoot,
             std::filesystem::directory_options::skip_permission_denied,
             error), end;
         iterator != end;
         iterator.increment(error))
    {
        if (error)
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Could not enumerate the project template files.");
            }
            return false;
        }
        const std::filesystem::directory_entry& entry = *iterator;
        if (entry.is_symlink(error))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Project templates cannot contain symbolic links.");
            }
            return false;
        }

        const std::filesystem::path relative = entry.path().lexically_relative(filesRoot);
        if (!IsSafeRelativePath(relative))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("A project template file escapes the template root.");
            }
            return false;
        }
        const std::filesystem::path destination = stagingRoot / relative;
        if (!IsPathWithin(destination, stagingRoot))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("A project template destination escapes the project root.");
            }
            return false;
        }
        if (entry.is_directory(error))
        {
            std::filesystem::create_directories(destination, error);
        }
        else if (entry.is_regular_file(error))
        {
            std::filesystem::create_directories(destination.parent_path(), error);
            if (!error)
            {
                std::filesystem::copy_file(
                    entry.path(), destination,
                    std::filesystem::copy_options::none,
                    error);
            }
        }
        if (error)
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Could not copy project template content: %1")
                                .arg(QString::fromStdString(error.message()));
            }
            return false;
        }
    }
    return true;
}

bool ExpandTemplateTextFiles(
    const ProjectTemplateInfo& projectTemplate,
    const std::filesystem::path& stagingRoot,
    const QString& projectName,
    const QUuid& projectId,
    QString* outError)
{
    for (const std::filesystem::path& relative : projectTemplate.textFiles)
    {
        const std::filesystem::path path = stagingRoot / relative;
        if (!IsPathWithin(path, stagingRoot))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("A template text file escapes the project root.");
            }
            return false;
        }

        QFile source(PathToQString(path));
        if (!source.open(QIODevice::ReadOnly))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Could not read template text file %1.")
                                .arg(PathToQString(relative));
            }
            return false;
        }
        QByteArray content = source.readAll();
        source.close();
        content.replace("{{PROJECT_NAME}}", projectName.toUtf8());
        content.replace(
            "{{PROJECT_ID}}",
            projectId.toString(QUuid::WithoutBraces).toUtf8());
        content.replace(
            "{{SCRIPT_ASSEMBLY}}",
            (projectName + QStringLiteral(".Scripts")).toUtf8());

        QSaveFile destination(PathToQString(path));
        if (!destination.open(QIODevice::WriteOnly) ||
            destination.write(content) != content.size() ||
            !destination.commit())
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Could not write template text file %1.")
                                .arg(PathToQString(relative));
            }
            return false;
        }
    }
    return true;
}

bool WriteScriptProject(
    const std::filesystem::path& stagingRoot,
    const QString& projectName,
    QString* outError)
{
    const QString assemblyName = projectName + QStringLiteral(".Scripts");
    const QString content = QStringLiteral(
        "<Project Sdk=\"Microsoft.NET.Sdk\">\n"
        "  <PropertyGroup>\n"
        "    <TargetFramework>net10.0</TargetFramework>\n"
        "    <AssemblyName>%1</AssemblyName>\n"
        "    <RootNamespace>%1</RootNamespace>\n"
        "    <Nullable>enable</Nullable>\n"
        "    <ImplicitUsings>enable</ImplicitUsings>\n"
        "  </PropertyGroup>\n"
        "  <ItemGroup>\n"
        "    <Reference Include=\"Crown.Managed\">\n"
        "      <HintPath>$(CrownManagedApiPath)</HintPath>\n"
        "      <Private>false</Private>\n"
        "    </Reference>\n"
        "  </ItemGroup>\n"
        "</Project>\n")
                                .arg(assemblyName.toHtmlEscaped());
    const std::filesystem::path path =
        stagingRoot / QStringToPath(projectName + QStringLiteral(".Scripts.csproj"));
    QSaveFile file(PathToQString(path));
    const QByteArray bytes = content.toUtf8();
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() ||
        !file.commit())
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not create the project C# project file.");
        }
        return false;
    }
    return true;
}

} // namespace

ProjectCreateResult CreateProject(const ProjectCreateRequest& request)
{
    ProjectCreateResult result;
    const QString name = request.displayName.trimmed();
    if (!IsValidProjectName(name))
    {
        result.error = QStringLiteral("Project names cannot be empty or contain < > : \" / \\ | ? *.");
        return result;
    }
    if (request.enableScripting && !request.projectTemplate.supportsScripting)
    {
        result.error = QStringLiteral("The selected template does not support C# scripting.");
        return result;
    }

    const std::filesystem::path parent =
        NormalizeAbsolutePath(request.parentDirectory);
    if (!std::filesystem::is_directory(parent))
    {
        result.error = QStringLiteral("The selected project parent directory does not exist.");
        return result;
    }

    const std::filesystem::path finalRoot = parent / QStringToPath(name);
    if (std::filesystem::exists(finalRoot))
    {
        result.error = QStringLiteral("The project destination already exists.");
        return result;
    }

    const QUuid projectId = QUuid::createUuid();
    const std::filesystem::path stagingRoot =
        parent / QStringToPath(QStringLiteral(".crown-create-") +
                               projectId.toString(QUuid::WithoutBraces));
    if (!IsPathWithin(stagingRoot, parent) || stagingRoot == parent)
    {
        result.error = QStringLiteral("The project staging path is invalid.");
        return result;
    }

    std::error_code error;
    std::filesystem::create_directory(stagingRoot, error);
    if (error)
    {
        result.error = QStringLiteral("Could not create the project staging directory: %1")
                           .arg(QString::fromStdString(error.message()));
        return result;
    }

    const auto cleanup = [&stagingRoot]()
    {
        std::error_code cleanupError;
        std::filesystem::remove_all(stagingRoot, cleanupError);
    };

    for (const std::filesystem::path& directory : request.projectTemplate.directories)
    {
        const std::filesystem::path destination = stagingRoot / directory;
        if (!IsPathWithin(destination, stagingRoot))
        {
            result.error = QStringLiteral("A template directory escapes the project root.");
            cleanup();
            return result;
        }
        std::filesystem::create_directories(destination, error);
        if (error)
        {
            result.error = QStringLiteral("Could not create project template directories.");
            cleanup();
            return result;
        }
    }

    if (!CopyTemplateTree(request.projectTemplate, stagingRoot, &result.error) ||
        !ExpandTemplateTextFiles(
            request.projectTemplate, stagingRoot, name, projectId, &result.error))
    {
        cleanup();
        return result;
    }

    ProjectDescriptor descriptor;
    descriptor.projectId = projectId;
    descriptor.displayName = name;
    descriptor.root = stagingRoot;
    descriptor.scripting.enabled = request.enableScripting;
    if (request.enableScripting)
    {
        descriptor.scripting.projectFile =
            QStringToPath(name + QStringLiteral(".Scripts.csproj"));
        descriptor.scripting.assemblyName = name + QStringLiteral(".Scripts");
        if (!WriteScriptProject(stagingRoot, name, &result.error))
        {
            cleanup();
            return result;
        }
    }

    const std::filesystem::path manifestPath =
        stagingRoot / QStringToPath(name + QStringLiteral(".crownproject"));
    descriptor.manifestPath = manifestPath;
    if (!WriteProjectDescriptor(descriptor, manifestPath, &result.error))
    {
        cleanup();
        return result;
    }

    const ProjectInspection inspection = InspectProject(stagingRoot);
    if (inspection.health != ProjectHealth::Ready)
    {
        result.error = QStringLiteral("The generated project failed validation: %1")
                           .arg(inspection.message);
        cleanup();
        return result;
    }

    std::filesystem::rename(stagingRoot, finalRoot, error);
    if (error)
    {
        result.error = QStringLiteral("Could not publish the generated project: %1")
                           .arg(QString::fromStdString(error.message()));
        cleanup();
        return result;
    }

    descriptor.root = NormalizeAbsolutePath(finalRoot);
    descriptor.manifestPath = descriptor.root / manifestPath.filename();
    result.descriptor = std::move(descriptor);
    return result;
}

} // namespace Crown::Launcher

