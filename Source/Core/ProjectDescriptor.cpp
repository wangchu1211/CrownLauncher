#include "Core/ProjectDescriptor.h"

#include "Core/PathUtils.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>

#include <vector>

namespace Crown::Launcher
{
namespace
{

std::optional<std::filesystem::path> FindManifest(
    const std::filesystem::path& root,
    QString* outError)
{
    const QDir directory(PathToQString(root));
    const QFileInfoList manifests = directory.entryInfoList(
        { QStringLiteral("*.crownproject") },
        QDir::Files | QDir::Readable,
        QDir::Name);
    if (manifests.isEmpty())
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("The project does not contain a .crownproject file.");
        }
        return std::nullopt;
    }
    if (manifests.size() != 1)
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("The project must contain exactly one .crownproject file.");
        }
        return std::nullopt;
    }
    return QStringToPath(manifests.front().absoluteFilePath());
}

} // namespace

ProjectDescriptorLoadResult LoadProjectDescriptor(
    const std::filesystem::path& projectRootOrManifest)
{
    ProjectDescriptorLoadResult result;
    const std::filesystem::path requested =
        NormalizeAbsolutePath(projectRootOrManifest);
    const QFileInfo requestedInfo(PathToQString(requested));
    if (!requestedInfo.exists())
    {
        result.error = QStringLiteral("The project path does not exist.");
        return result;
    }

    std::filesystem::path manifestPath;
    std::filesystem::path root;
    if (requestedInfo.isFile())
    {
        if (requestedInfo.suffix().compare(
                QStringLiteral("crownproject"), Qt::CaseInsensitive) != 0)
        {
            result.error = QStringLiteral("The selected file is not a .crownproject file.");
            return result;
        }
        manifestPath = requested;
        root = requested.parent_path();
    }
    else if (requestedInfo.isDir())
    {
        root = requested;
        const std::optional<std::filesystem::path> found =
            FindManifest(root, &result.error);
        if (!found.has_value())
        {
            return result;
        }
        manifestPath = *found;
    }
    else
    {
        result.error = QStringLiteral("The selected project path is not a directory or file.");
        return result;
    }

    QFile manifest(PathToQString(manifestPath));
    if (!manifest.open(QIODevice::ReadOnly))
    {
        result.error = QStringLiteral("Could not read the project manifest: %1")
                           .arg(manifest.errorString());
        return result;
    }

    QJsonParseError parseError;
    const QJsonDocument document =
        QJsonDocument::fromJson(manifest.readAll(), &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject())
    {
        result.error = QStringLiteral("The project manifest is not valid JSON: %1")
                           .arg(parseError.errorString());
        return result;
    }

    const QJsonObject object = document.object();
    ProjectDescriptor descriptor;
    descriptor.root = NormalizeAbsolutePath(root);
    descriptor.manifestPath = NormalizeAbsolutePath(manifestPath);
    descriptor.schemaVersion = object.value(QStringLiteral("schemaVersion")).toInt(-1);
    if (descriptor.schemaVersion != ProjectDescriptor::kCurrentSchemaVersion)
    {
        result.error = QStringLiteral("Unsupported project manifest schema version %1.")
                           .arg(descriptor.schemaVersion);
        return result;
    }

    descriptor.projectId =
        QUuid(object.value(QStringLiteral("projectId")).toString());
    if (descriptor.projectId.isNull())
    {
        result.error = QStringLiteral("The project manifest contains an invalid projectId.");
        return result;
    }

    descriptor.displayName =
        object.value(QStringLiteral("displayName")).toString().trimmed();
    if (descriptor.displayName.isEmpty())
    {
        result.error = QStringLiteral("The project manifest contains an empty displayName.");
        return result;
    }

    const QString editorVersion =
        object.value(QStringLiteral("editorVersion")).toString().trimmed();
    if (!editorVersion.isEmpty())
    {
        descriptor.editorVersion = editorVersion;
    }

    const QJsonObject scripting =
        object.value(QStringLiteral("scripting")).toObject();
    descriptor.scripting.enabled =
        scripting.value(QStringLiteral("enabled")).toBool(false);
    if (descriptor.scripting.enabled)
    {
        descriptor.scripting.projectFile = QStringToPath(
            scripting.value(QStringLiteral("projectFile")).toString().trimmed());
        descriptor.scripting.assemblyName =
            scripting.value(QStringLiteral("assemblyName")).toString().trimmed();
        if (!IsSafeRelativePath(descriptor.scripting.projectFile) ||
            descriptor.scripting.assemblyName.isEmpty())
        {
            result.error = QStringLiteral(
                "The project manifest contains an invalid scripting configuration.");
            return result;
        }
    }

    result.descriptor = std::move(descriptor);
    return result;
}

bool WriteProjectDescriptor(
    const ProjectDescriptor& descriptor,
    const std::filesystem::path& manifestPath,
    QString* outError)
{
    QJsonObject object;
    object.insert(QStringLiteral("schemaVersion"), descriptor.schemaVersion);
    object.insert(
        QStringLiteral("projectId"),
        descriptor.projectId.toString(QUuid::WithoutBraces));
    object.insert(QStringLiteral("displayName"), descriptor.displayName);
    if (descriptor.editorVersion.has_value() &&
        !descriptor.editorVersion->trimmed().isEmpty())
    {
        object.insert(QStringLiteral("editorVersion"), *descriptor.editorVersion);
    }

    QJsonObject scripting;
    scripting.insert(QStringLiteral("enabled"), descriptor.scripting.enabled);
    if (descriptor.scripting.enabled)
    {
        scripting.insert(
            QStringLiteral("projectFile"),
            PathToQString(descriptor.scripting.projectFile.generic_string()));
        scripting.insert(
            QStringLiteral("assemblyName"), descriptor.scripting.assemblyName);
    }
    object.insert(QStringLiteral("scripting"), scripting);

    QSaveFile file(PathToQString(manifestPath));
    if (!file.open(QIODevice::WriteOnly))
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not create the project manifest: %1")
                            .arg(file.errorString());
        }
        return false;
    }
    file.write(QJsonDocument(object).toJson(QJsonDocument::Indented));
    if (!file.commit())
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not commit the project manifest: %1")
                            .arg(file.errorString());
        }
        return false;
    }
    return true;
}

} // namespace Crown::Launcher

