#include "Core/ProjectSampleCreator.h"

#include "Core/PathUtils.h"
#include "Core/ProjectCreator.h"
#include "Core/ProjectValidator.h"

#include <QFileInfo>

#include <array>
#include <system_error>

namespace Crown::Launcher
{
namespace
{

bool IsGeneratedSamplePath(const std::filesystem::path& relative)
{
    if (relative.empty())
    {
        return false;
    }
    const QString first = PathToQString(*relative.begin());
    static constexpr std::array<const char*, 7> generated = {
        ".git", "bin", "Build", "Library", "Logs", "obj", "sample.json",
    };
    for (const char* name : generated)
    {
        if (first.compare(QString::fromLatin1(name), Qt::CaseInsensitive) == 0)
        {
            return true;
        }
    }
    return relative == std::filesystem::path("CMakeLists.txt") ||
           (relative.parent_path().empty() &&
            relative.extension() == std::filesystem::path(".crownproject"));
}

bool CopySampleTree(
    const std::filesystem::path& sourceRoot,
    const std::filesystem::path& stagingRoot,
    QString* outError)
{
    std::error_code error;
    for (std::filesystem::recursive_directory_iterator iterator(
             sourceRoot,
             std::filesystem::directory_options::skip_permission_denied,
             error), end;
         iterator != end;
         iterator.increment(error))
    {
        if (error)
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Could not enumerate the sample project.");
            }
            return false;
        }

        const std::filesystem::directory_entry& entry = *iterator;
        const std::filesystem::path relative =
            entry.path().lexically_relative(sourceRoot);
        if (!IsSafeRelativePath(relative))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("A sample path escapes the sample root.");
            }
            return false;
        }
        if (IsGeneratedSamplePath(relative))
        {
            if (entry.is_directory(error))
            {
                iterator.disable_recursion_pending();
            }
            continue;
        }
        if (entry.is_symlink(error))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("Sample projects cannot contain symbolic links.");
            }
            return false;
        }

        const std::filesystem::path destination = stagingRoot / relative;
        if (!IsPathWithin(destination, stagingRoot))
        {
            if (outError != nullptr)
            {
                *outError = QStringLiteral("A sample destination escapes the project root.");
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
                *outError = QStringLiteral("Could not copy sample content: %1")
                                .arg(QString::fromStdString(error.message()));
            }
            return false;
        }
    }
    return true;
}

} // namespace

ProjectSampleCreateResult CreateProjectFromSample(
    const ProjectSampleCreateRequest& request)
{
    ProjectSampleCreateResult result;
    const QString name = request.displayName.trimmed();
    if (!IsValidProjectDirectoryName(name))
    {
        result.error = QStringLiteral(
            "Project names cannot be empty or contain < > : \" / \\ | ? *.");
        return result;
    }

    const ProjectInspection sourceInspection = InspectProject(request.sample.root);
    if (sourceInspection.health != ProjectHealth::Ready ||
        !sourceInspection.descriptor)
    {
        result.error = QStringLiteral("The installed sample is invalid: %1")
                           .arg(sourceInspection.message);
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
        parent / QStringToPath(QStringLiteral(".crown-sample-") +
                               projectId.toString(QUuid::WithoutBraces));
    if (!IsPathWithin(stagingRoot, parent) || stagingRoot == parent)
    {
        result.error = QStringLiteral("The sample staging path is invalid.");
        return result;
    }

    std::error_code error;
    std::filesystem::create_directory(stagingRoot, error);
    if (error)
    {
        result.error = QStringLiteral("Could not create the sample staging directory: %1")
                           .arg(QString::fromStdString(error.message()));
        return result;
    }
    const auto cleanup = [&stagingRoot]()
    {
        std::error_code cleanupError;
        std::filesystem::remove_all(stagingRoot, cleanupError);
    };

    if (!CopySampleTree(request.sample.root, stagingRoot, &result.error))
    {
        cleanup();
        return result;
    }

    ProjectDescriptor descriptor = *sourceInspection.descriptor;
    descriptor.projectId = projectId;
    descriptor.displayName = name;
    descriptor.root = stagingRoot;
    descriptor.manifestPath =
        stagingRoot / QStringToPath(name + QStringLiteral(".crownproject"));
    if (!WriteProjectDescriptor(descriptor, descriptor.manifestPath, &result.error))
    {
        cleanup();
        return result;
    }

    const ProjectInspection generated = InspectProject(stagingRoot);
    if (generated.health != ProjectHealth::Ready)
    {
        result.error = QStringLiteral("The generated sample failed validation: %1")
                           .arg(generated.message);
        cleanup();
        return result;
    }

    std::filesystem::rename(stagingRoot, finalRoot, error);
    if (error)
    {
        result.error = QStringLiteral("Could not publish the sample project: %1")
                           .arg(QString::fromStdString(error.message()));
        cleanup();
        return result;
    }

    descriptor.root = NormalizeAbsolutePath(finalRoot);
    descriptor.manifestPath = descriptor.root / descriptor.manifestPath.filename();
    result.descriptor = std::move(descriptor);
    return result;
}

} // namespace Crown::Launcher
