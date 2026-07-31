#include "Qt/LauncherController.h"

#include "Core/PathUtils.h"
#include "Core/ProjectCreator.h"
#include "Core/ProjectSampleCreator.h"
#include "Core/ProjectValidator.h"

#include <QCoreApplication>
#include <QDesktopServices>
#include <QDir>
#include <QFileDialog>
#include <QFileInfo>
#include <QProcess>
#include <QSettings>
#include <QUrl>

#include <algorithm>

namespace Crown::Launcher
{
namespace
{

QString SettingsDefaultProjectDirectory()
{
    QSettings settings;
    const QString fallback = QDir::toNativeSeparators(
        QDir::home().filePath(QStringLiteral("CrownProjects")));
    return settings.value(QStringLiteral("projects/defaultDirectory"), fallback)
        .toString();
}

QString SettingsEditorExecutable()
{
    QSettings settings;
    return settings.value(QStringLiteral("editor/executable")).toString();
}

QString HealthLabel(const ProjectHealth health)
{
    switch (health)
    {
    case ProjectHealth::Ready:
        return QStringLiteral("Ready");
    case ProjectHealth::Missing:
        return QStringLiteral("Missing");
    case ProjectHealth::Invalid:
        return QStringLiteral("Needs attention");
    }
    return QStringLiteral("Unknown");
}

} // namespace

LauncherController::LauncherController(QObject* parent)
    : QObject(parent)
{
    QDir().mkpath(SettingsDefaultProjectDirectory());
    QString registryError;
    if (!m_Registry.Load(&registryError))
    {
        SetError(registryError);
    }
    ReloadEditorInstall();
    RebuildProjectList();
    SetStatus(QStringLiteral("Project Manager ready"));
}

QString LauncherController::DefaultProjectDirectory() const
{
    return QDir::toNativeSeparators(SettingsDefaultProjectDirectory());
}

QString LauncherController::EditorExecutable() const
{
    if (!m_EditorInstall.executable.empty())
    {
        return QDir::toNativeSeparators(PathToQString(m_EditorInstall.executable));
    }
    return QDir::toNativeSeparators(SettingsEditorExecutable());
}

void LauncherController::refresh()
{
    ReloadEditorInstall();
    RebuildProjectList();
    SetStatus(QStringLiteral("Project list refreshed"));
}

void LauncherController::selectProject(const QString& projectPath)
{
    const QString normalized = PathToQString(
        NormalizeAbsolutePath(QStringToPath(projectPath)));
    if (m_SelectedPath == normalized)
    {
        return;
    }
    m_SelectedPath = normalized;
    RebuildProjectList();
}

void LauncherController::SetSearchText(const QString& text)
{
    if (m_SearchText == text)
    {
        return;
    }
    m_SearchText = text;
    emit searchTextChanged();
    RebuildProjectList();
}

void LauncherController::importProject()
{
    const QString selected = QFileDialog::getExistingDirectory(
        nullptr,
        QStringLiteral("Import Crown Project"),
        SettingsDefaultProjectDirectory(),
        QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
    if (selected.isEmpty())
    {
        return;
    }

    const ProjectInspection inspection = InspectProject(QStringToPath(selected));
    if (inspection.health != ProjectHealth::Ready || !inspection.descriptor)
    {
        SetError(inspection.message);
        return;
    }
    m_Registry.AddOrUpdate(*inspection.descriptor);
    SaveRegistry();
    m_SelectedPath = PathToQString(inspection.descriptor->root);
    RebuildProjectList();
    SetStatus(QStringLiteral("Imported %1").arg(inspection.descriptor->displayName));
}

bool LauncherController::createProject(
    const QString& displayName,
    const QString& parentDirectory,
    const QString& templateId,
    const bool enableScripting)
{
    const ProjectTemplateInfo* projectTemplate = FindTemplate(templateId);
    if (projectTemplate == nullptr)
    {
        SetError(QStringLiteral("Choose a valid project template."));
        return false;
    }

    const ProjectCreateResult created = CreateProject({
        displayName,
        QStringToPath(parentDirectory),
        *projectTemplate,
        enableScripting,
    });
    if (!created.descriptor)
    {
        SetError(created.error);
        return false;
    }

    m_Registry.AddOrUpdate(*created.descriptor);
    SaveRegistry();
    m_SelectedPath = PathToQString(created.descriptor->root);
    RebuildProjectList();
    SetStatus(QStringLiteral("Created %1").arg(created.descriptor->displayName));
    return true;
}

bool LauncherController::createSampleProject(
    const QString& displayName,
    const QString& parentDirectory,
    const QString& sampleId)
{
    const ProjectSampleInfo* sample = FindSample(sampleId);
    if (sample == nullptr)
    {
        SetError(QStringLiteral("Choose a valid installed sample."));
        return false;
    }

    const ProjectSampleCreateResult created = CreateProjectFromSample({
        displayName,
        QStringToPath(parentDirectory),
        *sample,
    });
    if (!created.descriptor)
    {
        SetError(created.error);
        return false;
    }

    m_Registry.AddOrUpdate(*created.descriptor);
    SaveRegistry();
    m_SelectedPath = PathToQString(created.descriptor->root);
    RebuildProjectList();
    SetStatus(QStringLiteral("Created %1 from %2")
                  .arg(created.descriptor->displayName, sample->displayName));
    return true;
}

void LauncherController::openSelected()
{
    const std::optional<std::filesystem::path> root = SelectedRoot();
    if (!root)
    {
        SetError(QStringLiteral("Select a project to open."));
        return;
    }
    const ProjectInspection inspection = InspectProject(*root);
    if (inspection.health != ProjectHealth::Ready || !inspection.descriptor)
    {
        SetError(inspection.message);
        RebuildProjectList();
        return;
    }
    ReloadEditorInstall();
    if (!m_EditorInstall.IsValid())
    {
        SetError(m_EditorInstall.error);
        return;
    }

    const QString executable = PathToQString(m_EditorInstall.executable);
    const QStringList arguments = {
        QStringLiteral("--project"), PathToQString(inspection.descriptor->root),
        QStringLiteral("--launcher-pid"), QString::number(QCoreApplication::applicationPid()),
    };
    if (!QProcess::startDetached(executable, arguments, PathToQString(inspection.descriptor->root)))
    {
        SetError(QStringLiteral("CrownEditor could not be started."));
        return;
    }

    m_Registry.MarkOpened(*root);
    SaveRegistry();
    SetStatus(QStringLiteral("Opening %1 in CrownEditor").arg(inspection.descriptor->displayName));
    RebuildProjectList();
}

void LauncherController::revealSelected()
{
    const std::optional<std::filesystem::path> root = SelectedRoot();
    if (!root)
    {
        return;
    }
    QDesktopServices::openUrl(QUrl::fromLocalFile(PathToQString(*root)));
}

void LauncherController::removeSelected()
{
    const std::optional<std::filesystem::path> root = SelectedRoot();
    if (!root || !m_Registry.Remove(*root))
    {
        return;
    }
    SaveRegistry();
    m_SelectedPath.clear();
    RebuildProjectList();
    SetStatus(QStringLiteral("Removed project from this list; its files were not changed"));
}

void LauncherController::relinkSelected()
{
    const QString projectId = m_SelectedProject.value(QStringLiteral("projectId")).toString();
    if (projectId.isEmpty())
    {
        return;
    }
    const QString selected = QFileDialog::getExistingDirectory(
        nullptr,
        QStringLiteral("Locate Crown Project"),
        SettingsDefaultProjectDirectory(),
        QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
    if (selected.isEmpty())
    {
        return;
    }
    const ProjectInspection inspection = InspectProject(QStringToPath(selected));
    if (inspection.health != ProjectHealth::Ready || !inspection.descriptor)
    {
        SetError(inspection.message);
        return;
    }
    const QUuid expected(projectId);
    if (inspection.descriptor->projectId != expected)
    {
        SetError(QStringLiteral("The selected folder belongs to a different Crown project."));
        return;
    }
    if (!m_Registry.Relink(expected, inspection.descriptor->root))
    {
        SetError(QStringLiteral("The missing project record could not be relinked."));
        return;
    }
    SaveRegistry();
    m_SelectedPath = PathToQString(inspection.descriptor->root);
    RebuildProjectList();
    SetStatus(QStringLiteral("Project location updated"));
}

void LauncherController::toggleSelectedPinned()
{
    const std::optional<std::filesystem::path> root = SelectedRoot();
    if (!root)
    {
        return;
    }
    const bool pinned = m_SelectedProject.value(QStringLiteral("pinned")).toBool();
    if (m_Registry.SetPinned(*root, !pinned))
    {
        SaveRegistry();
        RebuildProjectList();
    }
}

QString LauncherController::chooseProjectParent(const QString& initialDirectory)
{
    return QFileDialog::getExistingDirectory(
        nullptr,
        QStringLiteral("Choose Project Location"),
        initialDirectory.isEmpty() ? SettingsDefaultProjectDirectory() : initialDirectory,
        QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
}

void LauncherController::chooseEditorExecutable()
{
#if defined(_WIN32)
    const QString filter = QStringLiteral("CrownEditor (crown_editor_qt.exe);;Applications (*.exe)");
#else
    const QString filter = QStringLiteral("Applications (*)");
#endif
    const QString selected = QFileDialog::getOpenFileName(
        nullptr,
        QStringLiteral("Choose CrownEditor"),
        QFileInfo(SettingsEditorExecutable()).absolutePath(),
        filter);
    if (selected.isEmpty())
    {
        return;
    }
    QSettings().setValue(QStringLiteral("editor/executable"), selected);
    ReloadEditorInstall();
    RebuildProjectList();
}

void LauncherController::setDefaultProjectDirectory(const QString& directory)
{
    if (directory.isEmpty() || !QFileInfo(directory).isDir())
    {
        SetError(QStringLiteral("The default project directory must exist."));
        return;
    }
    QSettings().setValue(QStringLiteral("projects/defaultDirectory"), directory);
    emit settingsChanged();
}

void LauncherController::clearError()
{
    SetError({});
}

void LauncherController::SetStatus(QString message)
{
    if (m_StatusMessage == message)
    {
        return;
    }
    m_StatusMessage = std::move(message);
    emit statusMessageChanged();
}

void LauncherController::SetError(QString message)
{
    if (m_ErrorMessage == message)
    {
        return;
    }
    m_ErrorMessage = std::move(message);
    emit errorMessageChanged();
}

void LauncherController::SaveRegistry()
{
    QString error;
    if (!m_Registry.Save(&error))
    {
        SetError(error);
    }
}

void LauncherController::ReloadEditorInstall()
{
    const BundledEditorInstallResolver resolver(
        QStringToPath(QCoreApplication::applicationDirPath()),
        QStringToPath(SettingsEditorExecutable()));
    m_EditorInstall = resolver.Resolve(std::nullopt);

    m_Templates.clear();
    m_ProjectTemplates.clear();
    m_SampleCatalog.clear();
    m_Samples.clear();
    if (m_EditorInstall.IsValid())
    {
        const ProjectTemplateCatalogResult catalog =
            LoadProjectTemplateCatalog(m_EditorInstall.templatesRoot);
        if (catalog.error.isEmpty())
        {
            m_Templates = catalog.templates;
            for (const ProjectTemplateInfo& entry : m_Templates)
            {
                m_ProjectTemplates.append(QVariantMap {
                    { QStringLiteral("id"), entry.id },
                    { QStringLiteral("displayName"), entry.displayName },
                    { QStringLiteral("description"), entry.description },
                    { QStringLiteral("supportsScripting"), entry.supportsScripting },
                });
            }
        }

        const ProjectSampleCatalogResult samples =
            LoadProjectSampleCatalog(m_EditorInstall.samplesRoot);
        if (samples.error.isEmpty())
        {
            m_SampleCatalog = samples.samples;
            for (const ProjectSampleInfo& entry : m_SampleCatalog)
            {
                m_Samples.append(QVariantMap {
                    { QStringLiteral("id"), entry.id },
                    { QStringLiteral("displayName"), entry.displayName },
                    { QStringLiteral("description"), entry.description },
                    { QStringLiteral("category"), entry.category },
                    { QStringLiteral("scripting"), entry.sourceProject.scripting.enabled },
                });
            }
        }
        else
        {
            SetError(samples.error);
        }
    }
    emit projectTemplatesChanged();
    emit samplesChanged();
    emit settingsChanged();
}

void LauncherController::RebuildProjectList()
{
    struct VisibleProject
    {
        QVariantMap values;
        QDateTime lastOpened;
        QString name;
        bool pinned = false;
    };
    std::vector<VisibleProject> visible;
    visible.reserve(m_Registry.Records().size());

    for (const ProjectRecord& record : m_Registry.Records())
    {
        const ProjectInspection inspection = InspectProject(record.path);
        const bool ready = inspection.health == ProjectHealth::Ready && inspection.descriptor;
        const QString name = ready
            ? inspection.descriptor->displayName
            : QFileInfo(PathToQString(record.path)).fileName();
        const QString nativePath = QDir::toNativeSeparators(PathToQString(record.path));
        if (!m_SearchText.trimmed().isEmpty() &&
            !name.contains(m_SearchText, Qt::CaseInsensitive) &&
            !nativePath.contains(m_SearchText, Qt::CaseInsensitive))
        {
            continue;
        }

        const QString lastOpened = record.lastOpenedAt.isValid()
            ? record.lastOpenedAt.toLocalTime().toString(QStringLiteral("yyyy-MM-dd  HH:mm"))
            : QStringLiteral("Never");
        QVariantMap values {
            { QStringLiteral("projectId"), record.projectId.toString(QUuid::WithoutBraces) },
            { QStringLiteral("name"), name },
            { QStringLiteral("path"), nativePath },
            { QStringLiteral("normalizedPath"), PathToQString(record.path) },
            { QStringLiteral("status"), HealthLabel(inspection.health) },
            { QStringLiteral("ready"), ready },
            { QStringLiteral("missing"), inspection.health == ProjectHealth::Missing },
            { QStringLiteral("message"), inspection.message },
            { QStringLiteral("pinned"), record.pinned },
            { QStringLiteral("lastOpened"), lastOpened },
            { QStringLiteral("scripting"), ready && inspection.descriptor->scripting.enabled },
            { QStringLiteral("manifest"), ready ? PathToQString(inspection.descriptor->manifestPath) : QString() },
            { QStringLiteral("editorVersion"), ready && inspection.descriptor->editorVersion
                    ? *inspection.descriptor->editorVersion
                    : QStringLiteral("Current") },
        };
        visible.push_back({ std::move(values), record.lastOpenedAt, name, record.pinned });
    }

    std::sort(visible.begin(), visible.end(), [](const VisibleProject& left, const VisibleProject& right)
    {
        if (left.pinned != right.pinned)
        {
            return left.pinned > right.pinned;
        }
        if (left.lastOpened != right.lastOpened)
        {
            return left.lastOpened > right.lastOpened;
        }
        return left.name.compare(right.name, Qt::CaseInsensitive) < 0;
    });

    m_Projects.clear();
    m_SelectedProject.clear();
    for (VisibleProject& project : visible)
    {
        if (project.values.value(QStringLiteral("normalizedPath")).toString() == m_SelectedPath)
        {
            m_SelectedProject = project.values;
        }
        m_Projects.append(std::move(project.values));
    }
    if (m_SelectedProject.isEmpty() && !m_Projects.isEmpty())
    {
        m_SelectedProject = m_Projects.front().toMap();
        m_SelectedPath = m_SelectedProject.value(QStringLiteral("normalizedPath")).toString();
    }
    if (m_Projects.isEmpty())
    {
        m_SelectedPath.clear();
    }
    emit projectsChanged();
    emit selectedProjectChanged();
}

const ProjectTemplateInfo* LauncherController::FindTemplate(const QString& templateId) const
{
    const auto found = std::find_if(
        m_Templates.begin(), m_Templates.end(),
        [&templateId](const ProjectTemplateInfo& entry) { return entry.id == templateId; });
    return found == m_Templates.end() ? nullptr : &*found;
}

const ProjectSampleInfo* LauncherController::FindSample(const QString& sampleId) const
{
    const auto found = std::find_if(
        m_SampleCatalog.begin(), m_SampleCatalog.end(),
        [&sampleId](const ProjectSampleInfo& entry) { return entry.id == sampleId; });
    return found == m_SampleCatalog.end() ? nullptr : &*found;
}

std::optional<std::filesystem::path> LauncherController::SelectedRoot() const
{
    if (m_SelectedPath.isEmpty())
    {
        return std::nullopt;
    }
    return QStringToPath(m_SelectedPath);
}

} // namespace Crown::Launcher
