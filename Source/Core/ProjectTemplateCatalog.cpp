#include "Core/ProjectTemplateCatalog.h"

#include "Core/PathUtils.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>

namespace Crown::Launcher
{

ProjectTemplateCatalogResult LoadProjectTemplateCatalog(
    const std::filesystem::path& templatesRoot)
{
    ProjectTemplateCatalogResult result;
    const QFileInfo rootInfo(PathToQString(templatesRoot));
    if (!rootInfo.exists() || !rootInfo.isDir())
    {
        result.error = QStringLiteral("The current CrownEditor does not provide project templates.");
        return result;
    }

    const QDir root(PathToQString(templatesRoot));
    for (const QFileInfo& directory : root.entryInfoList(
             QDir::Dirs | QDir::NoDotAndDotDot,
             QDir::Name))
    {
        QFile file(directory.absoluteFilePath() + QStringLiteral("/template.json"));
        if (!file.open(QIODevice::ReadOnly))
        {
            continue;
        }

        QJsonParseError parseError;
        const QJsonDocument document = QJsonDocument::fromJson(file.readAll(), &parseError);
        if (parseError.error != QJsonParseError::NoError || !document.isObject())
        {
            result.error = QStringLiteral("Project template %1 has an invalid template.json.")
                               .arg(directory.fileName());
            result.templates.clear();
            return result;
        }

        const QJsonObject object = document.object();
        ProjectTemplateInfo info;
        info.id = object.value(QStringLiteral("id")).toString().trimmed();
        info.displayName = object.value(QStringLiteral("displayName")).toString().trimmed();
        info.description = object.value(QStringLiteral("description")).toString().trimmed();
        info.supportsScripting = object.value(QStringLiteral("supportsScripting")).toBool(false);
        info.root = QStringToPath(directory.absoluteFilePath());

        const auto appendPaths = [&result, &directory](
                                     const QJsonArray& values,
                                     std::vector<std::filesystem::path>* destination) -> bool
        {
            for (const QJsonValue& value : values)
            {
                const std::filesystem::path path =
                    QStringToPath(value.toString().trimmed());
                if (!IsSafeRelativePath(path))
                {
                    result.error = QStringLiteral("Project template %1 contains an unsafe path.")
                                       .arg(directory.fileName());
                    return false;
                }
                destination->push_back(path);
            }
            return true;
        };

        if (info.id.isEmpty() || info.displayName.isEmpty() ||
            !appendPaths(object.value(QStringLiteral("directories")).toArray(), &info.directories) ||
            !appendPaths(object.value(QStringLiteral("textFiles")).toArray(), &info.textFiles))
        {
            if (result.error.isEmpty())
            {
                result.error = QStringLiteral("Project template %1 is missing required metadata.")
                                   .arg(directory.fileName());
            }
            result.templates.clear();
            return result;
        }
        result.templates.push_back(std::move(info));
    }

    if (result.templates.empty() && result.error.isEmpty())
    {
        result.error = QStringLiteral("No project templates were found for the current CrownEditor.");
    }
    return result;
}

} // namespace Crown::Launcher

