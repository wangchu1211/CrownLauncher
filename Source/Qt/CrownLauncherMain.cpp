#include "Qt/LauncherController.h"

#include <QApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>

int main(int argc, char* argv[])
{
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    QApplication application(argc, argv);
    QCoreApplication::setOrganizationName(QStringLiteral("CrownEngine"));
    QCoreApplication::setOrganizationDomain(QStringLiteral("crownengine.local"));
    QCoreApplication::setApplicationName(QStringLiteral("CrownLauncher"));
    QCoreApplication::setApplicationVersion(QStringLiteral("0.1.0"));

    Crown::Launcher::LauncherController controller;
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("launcher"), &controller);
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &application,
        []() { QCoreApplication::exit(-1); },
        Qt::QueuedConnection);
    engine.loadFromModule(QStringLiteral("Crown.Launcher"), QStringLiteral("Launcher"));
    return application.exec();
}
