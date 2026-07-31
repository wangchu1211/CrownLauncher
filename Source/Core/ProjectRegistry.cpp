#include "Core/ProjectRegistry.h"

#include "Core/PathUtils.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QStandardPaths>

#include <algorithm>

namespace Crown::Launcher
{

std::filesystem::path ProjectRegistry::DefaultRegistryPath()
{
    const QByteArray overridePath = qgetenv("CROWN_LAUNCHER_REGISTRY_PATH");
    if (!overridePath.isEmpty())
    {
        // WHY: visual and integration tests must not mutate the user's recent
        // projects. The process-local override is intentionally undocumented
        // product UI and can be removed when Launcher has a formal test profile.
        return NormalizeAbsolutePath(
            QStringToPath(QString::fromUtf8(overridePath)));
    }
    const QString configRoot = QStandardPaths::writableLocation(
        QStandardPaths::AppConfigLocation);
    return QStringToPath(configRoot) / "projects.json";
}

ProjectRegistry::ProjectRegistry(std::filesystem::path storagePath)
    : m_StoragePath(std::move(storagePath))
{
}

bool ProjectRegistry::Load(QString* outError)
{
    m_Records.clear();
    QFile file(PathToQString(m_StoragePath));
    if (!file.exists())
    {
        return true;
    }
    if (!file.open(QIODevice::ReadOnly))
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not read the project registry: %1")
                            .arg(file.errorString());
        }
        return false;
    }

    QJsonParseError parseError;
    const QJsonDocument document =
        QJsonDocument::fromJson(file.readAll(), &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject())
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("The project registry is invalid: %1")
                            .arg(parseError.errorString());
        }
        return false;
    }

    const QJsonObject root = document.object();
    if (root.value(QStringLiteral("schemaVersion")).toInt(-1) != 1)
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Unsupported project registry schema version.");
        }
        return false;
    }

    for (const QJsonValue& value : root.value(QStringLiteral("projects")).toArray())
    {
        const QJsonObject object = value.toObject();
        ProjectRecord record;
        record.projectId = QUuid(object.value(QStringLiteral("projectId")).toString());
        record.path = NormalizeAbsolutePath(QStringToPath(
            object.value(QStringLiteral("path")).toString()));
        record.pinned = object.value(QStringLiteral("pinned")).toBool(false);
        record.lastOpenedAt = QDateTime::fromString(
            object.value(QStringLiteral("lastOpenedAt")).toString(),
            Qt::ISODate);
        if (!record.projectId.isNull() && !record.path.empty())
        {
            m_Records.push_back(std::move(record));
        }
    }
    return true;
}

bool ProjectRegistry::Save(QString* outError) const
{
    const QDir parent(PathToQString(m_StoragePath.parent_path()));
    if (!parent.exists() && !QDir().mkpath(parent.absolutePath()))
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not create the Launcher configuration directory.");
        }
        return false;
    }

    QJsonArray projects;
    for (const ProjectRecord& record : m_Records)
    {
        QJsonObject object;
        object.insert(
            QStringLiteral("projectId"),
            record.projectId.toString(QUuid::WithoutBraces));
        object.insert(
            QStringLiteral("path"),
            PathToQString(record.path.generic_string()));
        object.insert(QStringLiteral("pinned"), record.pinned);
        object.insert(
            QStringLiteral("lastOpenedAt"),
            record.lastOpenedAt.isValid()
                ? record.lastOpenedAt.toUTC().toString(Qt::ISODate)
                : QString());
        projects.append(object);
    }

    QJsonObject root;
    root.insert(QStringLiteral("schemaVersion"), 1);
    root.insert(QStringLiteral("projects"), projects);

    QSaveFile file(PathToQString(m_StoragePath));
    if (!file.open(QIODevice::WriteOnly))
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not write the project registry: %1")
                            .arg(file.errorString());
        }
        return false;
    }
    file.write(QJsonDocument(root).toJson(QJsonDocument::Indented));
    if (!file.commit())
    {
        if (outError != nullptr)
        {
            *outError = QStringLiteral("Could not commit the project registry: %1")
                            .arg(file.errorString());
        }
        return false;
    }
    return true;
}

void ProjectRegistry::AddOrUpdate(const ProjectDescriptor& descriptor)
{
    ProjectRecord* existing = Find(descriptor.root);
    if (existing == nullptr)
    {
        const auto byId = std::find_if(
            m_Records.begin(), m_Records.end(),
            [&descriptor](const ProjectRecord& record)
            { return record.projectId == descriptor.projectId; });
        if (byId != m_Records.end())
        {
            existing = &*byId;
        }
    }
    if (existing == nullptr)
    {
        m_Records.push_back({
            descriptor.projectId,
            NormalizeAbsolutePath(descriptor.root),
            false,
            {},
        });
        return;
    }
    existing->projectId = descriptor.projectId;
    existing->path = NormalizeAbsolutePath(descriptor.root);
}

bool ProjectRegistry::Remove(const std::filesystem::path& projectRoot)
{
    const std::filesystem::path normalized = NormalizeAbsolutePath(projectRoot);
    const auto before = m_Records.size();
    std::erase_if(m_Records, [&normalized](const ProjectRecord& record)
                  { return NormalizeAbsolutePath(record.path) == normalized; });
    return m_Records.size() != before;
}

bool ProjectRegistry::Relink(
    const QUuid& projectId,
    const std::filesystem::path& newRoot)
{
    const auto found = std::find_if(
        m_Records.begin(), m_Records.end(),
        [&projectId](const ProjectRecord& record)
        { return record.projectId == projectId; });
    if (found == m_Records.end())
    {
        return false;
    }
    found->path = NormalizeAbsolutePath(newRoot);
    return true;
}

bool ProjectRegistry::SetPinned(
    const std::filesystem::path& projectRoot,
    const bool pinned)
{
    ProjectRecord* record = Find(projectRoot);
    if (record == nullptr)
    {
        return false;
    }
    record->pinned = pinned;
    return true;
}

bool ProjectRegistry::MarkOpened(const std::filesystem::path& projectRoot)
{
    ProjectRecord* record = Find(projectRoot);
    if (record == nullptr)
    {
        return false;
    }
    record->lastOpenedAt = QDateTime::currentDateTimeUtc();
    return true;
}

ProjectRecord* ProjectRegistry::Find(
    const std::filesystem::path& projectRoot)
{
    const std::filesystem::path normalized = NormalizeAbsolutePath(projectRoot);
    const auto found = std::find_if(
        m_Records.begin(), m_Records.end(),
        [&normalized](const ProjectRecord& record)
        { return NormalizeAbsolutePath(record.path) == normalized; });
    return found == m_Records.end() ? nullptr : &*found;
}

} // namespace Crown::Launcher
