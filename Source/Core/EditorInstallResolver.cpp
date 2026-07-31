#include "Core/EditorInstallResolver.h"

#include "Core/PathUtils.h"

#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtGlobal>

namespace Crown::Launcher
{

BundledEditorInstallResolver::BundledEditorInstallResolver(
    std::filesystem::path applicationDirectory,
    std::filesystem::path configuredExecutable)
    : m_ApplicationDirectory(NormalizeAbsolutePath(applicationDirectory))
    , m_ConfiguredExecutable(std::move(configuredExecutable))
{
}

EditorInstall BundledEditorInstallResolver::Resolve(
    const std::optional<QString>& requestedVersion) const
{
    EditorInstall install;
    if (requestedVersion.has_value())
    {
        install.error = QStringLiteral(
            "This CrownLauncher build does not yet manage versioned Editor installs.");
        return install;
    }

    std::filesystem::path executable = m_ConfiguredExecutable;
    if (executable.empty())
    {
        const QByteArray environment = qgetenv("CROWN_EDITOR_EXECUTABLE");
        if (!environment.isEmpty())
        {
            executable = QStringToPath(QString::fromUtf8(environment));
        }
    }
    if (executable.empty())
    {
#if defined(_WIN32)
        executable = m_ApplicationDirectory / "crown_editor_qt.exe";
#else
        executable = m_ApplicationDirectory / "crown_editor_qt";
#endif
    }
    executable = NormalizeAbsolutePath(executable);
    if (!std::filesystem::is_regular_file(executable))
    {
        install.error = QStringLiteral(
            "CrownEditor was not found. Configure its executable in Launcher Settings.");
        return install;
    }

    install.executable = executable;
    install.root = executable.parent_path();
    install.templatesRoot = install.root / "Templates";
    install.samplesRoot = install.root / "Samples";
    install.displayVersion = QStringLiteral("Current");

    QFile versionFile(PathToQString(install.root / "version.json"));
    if (versionFile.open(QIODevice::ReadOnly))
    {
        const QJsonDocument document = QJsonDocument::fromJson(versionFile.readAll());
        const QString version =
            document.object().value(QStringLiteral("version")).toString().trimmed();
        if (!version.isEmpty())
        {
            install.displayVersion = version;
        }
    }
    return install;
}

} // namespace Crown::Launcher
