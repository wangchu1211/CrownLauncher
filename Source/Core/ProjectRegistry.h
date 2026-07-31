#pragma once

#include "Core/ProjectDescriptor.h"

#include <QDateTime>
#include <QString>
#include <QUuid>

#include <filesystem>
#include <vector>

namespace Crown::Launcher
{

struct ProjectRecord
{
    QUuid projectId;
    std::filesystem::path path;
    bool pinned = false;
    QDateTime lastOpenedAt;
};

class ProjectRegistry
{
public:
    static std::filesystem::path DefaultRegistryPath();

    explicit ProjectRegistry(
        std::filesystem::path storagePath = DefaultRegistryPath());

    bool Load(QString* outError = nullptr);
    bool Save(QString* outError = nullptr) const;

    const std::vector<ProjectRecord>& Records() const { return m_Records; }
    void AddOrUpdate(const ProjectDescriptor& descriptor);
    bool Remove(const std::filesystem::path& projectRoot);
    bool Relink(const QUuid& projectId, const std::filesystem::path& newRoot);
    bool SetPinned(const std::filesystem::path& projectRoot, bool pinned);
    bool MarkOpened(const std::filesystem::path& projectRoot);

private:
    ProjectRecord* Find(const std::filesystem::path& projectRoot);

    std::filesystem::path m_StoragePath;
    std::vector<ProjectRecord> m_Records;
};

} // namespace Crown::Launcher

