#include "Core/ProjectSampleCatalog.h"

#include "Core/PathUtils.h"
#include "Core/ProjectValidator.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>

namespace Crown::Launcher
{

ProjectSampleCatalogResult LoadProjectSampleCatalog(
    const std::filesystem::path& samplesRoot)
{
    ProjectSampleCatalogResult result;
    const QFileInfo rootInfo(PathToQString(samplesRoot));
    if (!rootInfo.exists() || !rootInfo.isDir())
    {
        return result;
    }

    QSet<QString> ids;
    const QDir root(PathToQString(samplesRoot));
    for (const QFileInfo& directory : root.entryInfoList(
             QDir::Dirs | QDir::NoDotAndDotDot,
             QDir::Name))
    {
        QFile metadata(directory.absoluteFilePath() + QStringLiteral("/sample.json"));
        if (!metadata.open(QIODevice::ReadOnly))
        {
            continue;
        }

        QJsonParseError parseError;
        const QJsonDocument document = QJsonDocument::fromJson(
            metadata.readAll(), &parseError);
        const QJsonObject object = document.object();
        const QString id = object.value(QStringLiteral("id")).toString().trimmed();
        const QString displayName =
            object.value(QStringLiteral("displayName")).toString().trimmed();
        if (parseError.error != QJsonParseError::NoError || !document.isObject() ||
            object.value(QStringLiteral("schemaVersion")).toInt() != 1 ||
            id.isEmpty() || displayName.isEmpty() || ids.contains(id))
        {
            result.error = QStringLiteral("Sample %1 has invalid or duplicate metadata.")
                               .arg(directory.fileName());
            result.samples.clear();
            return result;
        }

        const std::filesystem::path sampleRoot =
            QStringToPath(directory.absoluteFilePath());
        const ProjectInspection inspection = InspectProject(sampleRoot);
        if (inspection.health != ProjectHealth::Ready || !inspection.descriptor)
        {
            result.error = QStringLiteral("Sample %1 is not a valid Crown project: %2")
                               .arg(directory.fileName(), inspection.message);
            result.samples.clear();
            return result;
        }

        ids.insert(id);
        result.samples.push_back({
            id,
            displayName,
            object.value(QStringLiteral("description")).toString().trimmed(),
            object.value(QStringLiteral("category")).toString().trimmed(),
            sampleRoot,
            *inspection.descriptor,
        });
    }
    return result;
}

} // namespace Crown::Launcher
