#pragma once

#include "Core/EditorInstallResolver.h"
#include "Core/ProjectRegistry.h"
#include "Core/ProjectSampleCatalog.h"
#include "Core/ProjectTemplateCatalog.h"

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

#include <filesystem>
#include <optional>
#include <vector>

namespace Crown::Launcher
{

class LauncherController final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantList projects READ Projects NOTIFY projectsChanged)
    Q_PROPERTY(QVariantMap selectedProject READ SelectedProject NOTIFY selectedProjectChanged)
    Q_PROPERTY(QVariantList projectTemplates READ ProjectTemplates NOTIFY projectTemplatesChanged)
    Q_PROPERTY(QVariantList samples READ Samples NOTIFY samplesChanged)
    Q_PROPERTY(QString searchText READ SearchText WRITE SetSearchText NOTIFY searchTextChanged)
    Q_PROPERTY(QString statusMessage READ StatusMessage NOTIFY statusMessageChanged)
    Q_PROPERTY(QString errorMessage READ ErrorMessage NOTIFY errorMessageChanged)
    Q_PROPERTY(QString defaultProjectDirectory READ DefaultProjectDirectory NOTIFY settingsChanged)
    Q_PROPERTY(QString editorExecutable READ EditorExecutable NOTIFY settingsChanged)
    Q_PROPERTY(QString editorVersion READ EditorVersion NOTIFY settingsChanged)
    Q_PROPERTY(bool editorReady READ EditorReady NOTIFY settingsChanged)

public:
    explicit LauncherController(QObject* parent = nullptr);

    QVariantList Projects() const { return m_Projects; }
    QVariantMap SelectedProject() const { return m_SelectedProject; }
    QVariantList ProjectTemplates() const { return m_ProjectTemplates; }
    QVariantList Samples() const { return m_Samples; }
    QString SearchText() const { return m_SearchText; }
    QString StatusMessage() const { return m_StatusMessage; }
    QString ErrorMessage() const { return m_ErrorMessage; }
    QString DefaultProjectDirectory() const;
    QString EditorExecutable() const;
    QString EditorVersion() const { return m_EditorInstall.displayVersion; }
    bool EditorReady() const { return m_EditorInstall.IsValid(); }

    Q_INVOKABLE void refresh();
    Q_INVOKABLE void selectProject(const QString& projectPath);
    Q_INVOKABLE void setSearchText(const QString& text) { SetSearchText(text); }
    Q_INVOKABLE void importProject();
    Q_INVOKABLE bool createProject(
        const QString& displayName,
        const QString& parentDirectory,
        const QString& templateId,
        bool enableScripting);
    Q_INVOKABLE bool createSampleProject(
        const QString& displayName,
        const QString& parentDirectory,
        const QString& sampleId);
    Q_INVOKABLE void openSelected();
    Q_INVOKABLE void revealSelected();
    Q_INVOKABLE void removeSelected();
    Q_INVOKABLE void relinkSelected();
    Q_INVOKABLE void toggleSelectedPinned();
    Q_INVOKABLE QString chooseProjectParent(const QString& initialDirectory);
    Q_INVOKABLE void chooseEditorExecutable();
    Q_INVOKABLE void setDefaultProjectDirectory(const QString& directory);
    Q_INVOKABLE void clearError();

signals:
    void projectsChanged();
    void selectedProjectChanged();
    void projectTemplatesChanged();
    void samplesChanged();
    void searchTextChanged();
    void statusMessageChanged();
    void errorMessageChanged();
    void settingsChanged();

private:
    void SetSearchText(const QString& text);
    void SetStatus(QString message);
    void SetError(QString message);
    void SaveRegistry();
    void ReloadEditorInstall();
    void RebuildProjectList();
    const ProjectTemplateInfo* FindTemplate(const QString& templateId) const;
    const ProjectSampleInfo* FindSample(const QString& sampleId) const;
    std::optional<std::filesystem::path> SelectedRoot() const;

    ProjectRegistry m_Registry;
    EditorInstall m_EditorInstall;
    std::vector<ProjectTemplateInfo> m_Templates;
    std::vector<ProjectSampleInfo> m_SampleCatalog;
    QVariantList m_Projects;
    QVariantMap m_SelectedProject;
    QVariantList m_ProjectTemplates;
    QVariantList m_Samples;
    QString m_SearchText;
    QString m_SelectedPath;
    QString m_StatusMessage;
    QString m_ErrorMessage;
};

} // namespace Crown::Launcher
