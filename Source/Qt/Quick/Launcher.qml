import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: window
    width: 1380
    height: 790
    minimumWidth: 1080
    minimumHeight: 650
    visible: true
    title: "Crown Launcher"
    color: "#171311"
    font.family: "Segoe UI"
    font.pixelSize: 13

    readonly property color bg: "#171311"
    readonly property color chrome: "#211A17"
    readonly property color panel: "#261E1B"
    readonly property color panelRaised: "#302622"
    readonly property color line: "#473833"
    readonly property color lineSoft: "#372B27"
    readonly property color textMain: "#E8DDD7"
    readonly property color textMuted: "#A99991"
    readonly property color accent: "#F08363"
    readonly property color accentDim: "#5A3028"
    readonly property color success: "#81B29A"
    readonly property color warning: "#D7A35D"
    readonly property color danger: "#D06A62"

    component FlatButton: Button {
        id: control
        property bool accentButton: false
        property bool dangerButton: false
        implicitHeight: 32
        leftPadding: 13
        rightPadding: 13
        font.pixelSize: 12
        font.weight: Font.DemiBold
        contentItem: Text {
            text: control.text
            color: control.enabled
                   ? (control.accentButton ? "#241613" : (control.dangerButton ? window.danger : window.textMain))
                   : "#6D5E58"
            font: control.font
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            radius: 3
            color: !control.enabled ? "#2A2320"
                   : control.down ? (control.accentButton ? "#D76F52" : "#493832")
                   : control.hovered ? (control.accentButton ? "#F59477" : "#3D302C")
                   : control.accentButton ? window.accent : "#302622"
            border.color: control.accentButton ? "#F29A80" : (control.dangerButton ? "#75443F" : window.line)
            border.width: 1
        }
    }

    component ToolButtonSmall: Button {
        id: control
        implicitWidth: 30
        implicitHeight: 30
        padding: 0
        font.pixelSize: 15
        contentItem: Text {
            text: control.text
            color: control.enabled ? window.textMuted : "#635550"
            font: control.font
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
        background: Rectangle {
            radius: 3
            color: control.hovered ? "#3B302B" : "transparent"
            border.color: control.hovered ? window.line : "transparent"
        }
    }

    component CrownField: TextField {
        id: control
        implicitHeight: 32
        leftPadding: 10
        rightPadding: 10
        color: window.textMain
        selectionColor: window.accentDim
        selectedTextColor: window.textMain
        placeholderTextColor: "#786A64"
        font.pixelSize: 12
        background: Rectangle {
            color: "#1D1715"
            radius: 3
            border.width: 1
            border.color: control.activeFocus ? window.accent : window.line
        }
    }

    component FieldLabel: Text {
        color: window.textMuted
        font.pixelSize: 11
        font.weight: Font.DemiBold
    }

    header: Rectangle {
        height: 42
        color: window.chrome
        border.color: window.lineSoft

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 14
            anchors.rightMargin: 10
            spacing: 10

            Rectangle {
                width: 22
                height: 22
                radius: 5
                color: window.accent
                Text {
                    anchors.centerIn: parent
                    text: "C"
                    color: "#2A1712"
                    font.bold: true
                    font.pixelSize: 14
                }
            }
            Text {
                text: "CROWN"
                color: window.textMain
                font.pixelSize: 12
                font.bold: true
                font.letterSpacing: 1.3
            }
            Rectangle { width: 1; height: 18; color: window.line }
            Text {
                text: "Project Manager"
                color: window.textMuted
                font.pixelSize: 12
            }
            Item { Layout.fillWidth: true }
            Rectangle {
                implicitWidth: editorStateRow.implicitWidth + 18
                implicitHeight: 26
                radius: 3
                color: "#1B1614"
                border.color: window.lineSoft
                Row {
                    id: editorStateRow
                    anchors.centerIn: parent
                    spacing: 7
                    Rectangle {
                        anchors.verticalCenter: parent.verticalCenter
                        width: 7; height: 7; radius: 4
                        color: launcher.editorReady ? window.success : window.warning
                    }
                    Text {
                        text: launcher.editorReady ? "Editor " + launcher.editorVersion : "Editor not configured"
                        color: window.textMuted
                        font.pixelSize: 11
                    }
                }
            }
            ToolButtonSmall { text: "⚙"; onClicked: settingsDialog.open() }
        }
    }

    footer: Rectangle {
        height: 27
        color: "#1D1715"
        border.color: window.lineSoft
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 8
            Rectangle { width: 6; height: 6; radius: 3; color: window.success }
            Text { text: launcher.statusMessage; color: window.textMuted; font.pixelSize: 11 }
            Item { Layout.fillWidth: true }
            Text {
                text: launcher.projects.length + (launcher.projects.length === 1 ? " project" : " projects")
                color: "#7E6F69"
                font.pixelSize: 11
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 146
            color: window.chrome
            border.color: window.lineSoft

            Column {
                anchors.fill: parent
                anchors.topMargin: 14
                anchors.leftMargin: 9
                anchors.rightMargin: 9
                spacing: 4

                Text {
                    text: "WORKSPACE"
                    color: "#786A64"
                    font.pixelSize: 9
                    font.bold: true
                    font.letterSpacing: 1.2
                    leftPadding: 9
                    bottomPadding: 5
                }
                Rectangle {
                    width: parent.width
                    height: 34
                    radius: 3
                    color: window.accentDim
                    border.color: "#754336"
                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        spacing: 9
                        Text { anchors.verticalCenter: parent.verticalCenter; text: "▦"; color: window.accent; font.pixelSize: 14 }
                        Text { anchors.verticalCenter: parent.verticalCenter; text: "Projects"; color: window.textMain; font.pixelSize: 12; font.bold: true }
                    }
                }
                Rectangle {
                    width: parent.width
                    height: 34
                    radius: 3
                    color: settingsHover.containsMouse ? "#302622" : "transparent"
                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        spacing: 9
                        Text { anchors.verticalCenter: parent.verticalCenter; text: "⚙"; color: window.textMuted; font.pixelSize: 13 }
                        Text { anchors.verticalCenter: parent.verticalCenter; text: "Settings"; color: window.textMuted; font.pixelSize: 12 }
                    }
                    MouseArea { id: settingsHover; anchors.fill: parent; hoverEnabled: true; onClicked: settingsDialog.open() }
                }

                Item { width: 1; height: 18 }
                Text {
                    width: parent.width
                    text: "CURRENT EDITOR"
                    color: "#786A64"
                    font.pixelSize: 9
                    font.bold: true
                    font.letterSpacing: 1.1
                    leftPadding: 9
                }
                Rectangle {
                    width: parent.width
                    height: 57
                    radius: 3
                    color: "#1C1715"
                    border.color: window.lineSoft
                    Column {
                        anchors.fill: parent
                        anchors.margins: 9
                        spacing: 4
                        Text {
                            text: launcher.editorReady ? "CrownEditor" : "Not found"
                            color: launcher.editorReady ? window.textMain : window.warning
                            font.pixelSize: 11
                            font.bold: true
                        }
                        Text {
                            width: parent.width
                            text: launcher.editorReady ? launcher.editorVersion : "Set executable"
                            color: window.textMuted
                            font.pixelSize: 10
                            elide: Text.ElideRight
                        }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: window.bg

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 18
                spacing: 12

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "Projects"
                        color: window.textMain
                        font.pixelSize: 21
                        font.weight: Font.DemiBold
                    }
                    Text {
                        text: "Open or create a Crown workspace"
                        color: window.textMuted
                        font.pixelSize: 11
                        Layout.alignment: Qt.AlignBottom
                        bottomPadding: 2
                    }
                    Item { Layout.fillWidth: true }
                    FlatButton { text: "Import"; onClicked: launcher.importProject() }
                    FlatButton {
                        text: "+  New Project"
                        accentButton: true
                        enabled: launcher.projectTemplates.length > 0
                        onClicked: createDialog.open()
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 7
                    CrownField {
                        Layout.fillWidth: true
                        placeholderText: "Search by project name or path"
                        text: launcher.searchText
                        onTextEdited: launcher.setSearchText(text)
                    }
                    ToolButtonSmall { text: "↻"; onClicked: launcher.refresh() }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: window.panel
                    border.color: window.lineSoft
                    radius: 3

                    ColumnLayout {
                        anchors.fill: parent
                        spacing: 0

                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 31
                            color: "#2B221F"
                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 12
                                spacing: 8
                                Text { Layout.preferredWidth: 22; text: "" }
                                Text { Layout.fillWidth: true; text: "PROJECT"; color: "#8D7D76"; font.pixelSize: 9; font.bold: true; font.letterSpacing: 0.8 }
                                Text { Layout.preferredWidth: 116; text: "LAST OPENED"; color: "#8D7D76"; font.pixelSize: 9; font.bold: true; font.letterSpacing: 0.8 }
                                Text { Layout.preferredWidth: 93; text: "STATUS"; color: "#8D7D76"; font.pixelSize: 9; font.bold: true; font.letterSpacing: 0.8 }
                            }
                        }
                        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: window.line }

                        ListView {
                            id: projectList
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            model: launcher.projects
                            boundsBehavior: Flickable.StopAtBounds
                            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                            delegate: Rectangle {
                                id: projectRow
                                required property var modelData
                                width: projectList.width
                                height: 55
                                color: modelData.normalizedPath === launcher.selectedProject.normalizedPath
                                       ? "#3A2B27"
                                       : rowMouse.containsMouse ? "#302622" : "transparent"
                                Rectangle {
                                    visible: modelData.normalizedPath === launcher.selectedProject.normalizedPath
                                    width: 2; height: parent.height; color: window.accent
                                }
                                Rectangle { anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right; height: 1; color: window.lineSoft }
                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 12
                                    anchors.rightMargin: 12
                                    spacing: 8
                                    Text {
                                        Layout.preferredWidth: 22
                                        text: modelData.pinned ? "◆" : "◇"
                                        color: modelData.pinned ? window.accent : "#6F605A"
                                        font.pixelSize: 10
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 2
                                        Text {
                                            Layout.fillWidth: true
                                            text: modelData.name
                                            color: modelData.ready ? window.textMain : "#B9A9A2"
                                            font.pixelSize: 12
                                            font.weight: Font.DemiBold
                                            elide: Text.ElideRight
                                        }
                                        Text {
                                            Layout.fillWidth: true
                                            text: modelData.path
                                            color: "#8C7C75"
                                            font.pixelSize: 10
                                            elide: Text.ElideMiddle
                                        }
                                    }
                                    Text {
                                        Layout.preferredWidth: 116
                                        text: modelData.lastOpened
                                        color: window.textMuted
                                        font.pixelSize: 10
                                    }
                                    Row {
                                        Layout.preferredWidth: 93
                                        spacing: 6
                                        Rectangle {
                                            anchors.verticalCenter: parent.verticalCenter
                                            width: 6; height: 6; radius: 3
                                            color: modelData.ready ? window.success : (modelData.missing ? window.danger : window.warning)
                                        }
                                        Text {
                                            text: modelData.status
                                            color: window.textMuted
                                            font.pixelSize: 10
                                        }
                                    }
                                }
                                MouseArea {
                                    id: rowMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    acceptedButtons: Qt.LeftButton
                                    onClicked: launcher.selectProject(modelData.normalizedPath)
                                    onDoubleClicked: {
                                        launcher.selectProject(modelData.normalizedPath)
                                        launcher.openSelected()
                                    }
                                }
                            }

                            Column {
                                anchors.centerIn: parent
                                visible: projectList.count === 0
                                spacing: 8
                                Text {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    text: launcher.searchText.length > 0 ? "No matching projects" : "No projects yet"
                                    color: window.textMain
                                    font.pixelSize: 15
                                    font.weight: Font.DemiBold
                                }
                                Text {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    text: launcher.searchText.length > 0
                                          ? "Try a different name or path."
                                          : "Import an existing project or create a new one."
                                    color: window.textMuted
                                    font.pixelSize: 11
                                }
                            }
                        }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 308
            color: window.chrome
            border.color: window.lineSoft

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 16
                spacing: 12

                RowLayout {
                    Layout.fillWidth: true
                    Text { text: "DETAILS"; color: "#8C7C75"; font.pixelSize: 9; font.bold: true; font.letterSpacing: 1.1 }
                    Item { Layout.fillWidth: true }
                    ToolButtonSmall {
                        text: launcher.selectedProject.pinned ? "◆" : "◇"
                        enabled: launcher.selectedProject.name !== undefined
                        onClicked: launcher.toggleSelectedPinned()
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 80
                    color: window.panel
                    radius: 3
                    border.color: window.line
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 12
                        spacing: 11
                        Rectangle {
                            width: 42; height: 42; radius: 5
                            color: launcher.selectedProject.ready ? window.accentDim : "#392B27"
                            border.color: launcher.selectedProject.ready ? "#7A4337" : window.line
                            Text { anchors.centerIn: parent; text: "C"; color: launcher.selectedProject.ready ? window.accent : "#81716A"; font.pixelSize: 20; font.bold: true }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 3
                            Text {
                                Layout.fillWidth: true
                                text: launcher.selectedProject.name || "No project selected"
                                color: window.textMain
                                font.pixelSize: 14
                                font.weight: Font.DemiBold
                                elide: Text.ElideRight
                            }
                            Text {
                                text: launcher.selectedProject.status || "—"
                                color: launcher.selectedProject.ready ? window.success
                                      : launcher.selectedProject.missing ? window.danger : window.warning
                                font.pixelSize: 10
                            }
                        }
                    }
                }

                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    columnSpacing: 10
                    rowSpacing: 9
                    FieldLabel { text: "Editor" }
                    Text { Layout.fillWidth: true; text: launcher.selectedProject.editorVersion || "—"; color: window.textMain; font.pixelSize: 11; elide: Text.ElideRight }
                    FieldLabel { text: "Scripting" }
                    Text { Layout.fillWidth: true; text: launcher.selectedProject.scripting ? "C# enabled" : "Disabled"; color: window.textMain; font.pixelSize: 11 }
                    FieldLabel { text: "Last opened" }
                    Text { Layout.fillWidth: true; text: launcher.selectedProject.lastOpened || "—"; color: window.textMain; font.pixelSize: 11 }
                }

                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: window.lineSoft }
                FieldLabel { text: "PROJECT LOCATION" }
                Text {
                    Layout.fillWidth: true
                    text: launcher.selectedProject.path || "Select a project to inspect its location."
                    color: window.textMuted
                    font.pixelSize: 10
                    wrapMode: Text.WrapAnywhere
                    maximumLineCount: 4
                    elide: Text.ElideMiddle
                }
                Text {
                    Layout.fillWidth: true
                    visible: launcher.selectedProject.ready === false && launcher.selectedProject.message
                    text: launcher.selectedProject.message || ""
                    color: launcher.selectedProject.missing ? window.danger : window.warning
                    font.pixelSize: 10
                    wrapMode: Text.WordWrap
                }

                RowLayout {
                    Layout.fillWidth: true
                    FlatButton {
                        Layout.fillWidth: true
                        text: "Show in Explorer"
                        enabled: launcher.selectedProject.name !== undefined && !launcher.selectedProject.missing
                        onClicked: launcher.revealSelected()
                    }
                    FlatButton {
                        text: "Relink"
                        visible: launcher.selectedProject.missing === true
                        onClicked: launcher.relinkSelected()
                    }
                }

                Item { Layout.fillHeight: true }
                FlatButton {
                    Layout.fillWidth: true
                    text: launcher.editorReady ? "Open in CrownEditor" : "Configure CrownEditor"
                    accentButton: launcher.editorReady
                    enabled: launcher.selectedProject.ready === true
                    onClicked: launcher.editorReady ? launcher.openSelected() : settingsDialog.open()
                }
                FlatButton {
                    Layout.fillWidth: true
                    text: "Remove from List"
                    dangerButton: true
                    enabled: launcher.selectedProject.name !== undefined
                    onClicked: removeDialog.open()
                }
            }
        }
    }

    Dialog {
        id: createDialog
        anchors.centerIn: Overlay.overlay
        width: 510
        height: 474
        modal: true
        padding: 0
        closePolicy: Popup.CloseOnEscape
        onOpened: {
            createName.text = ""
            createLocation.text = launcher.defaultProjectDirectory
            createScripting.checked = false
            createName.forceActiveFocus()
        }
        background: Rectangle { color: window.panel; border.color: window.line; radius: 5 }
        contentItem: ColumnLayout {
            spacing: 0
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 48
                color: "#2D2420"
                border.color: window.lineSoft
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 16; anchors.rightMargin: 10
                    Text { text: "Create Crown Project"; color: window.textMain; font.pixelSize: 15; font.weight: Font.DemiBold }
                    Item { Layout.fillWidth: true }
                    ToolButtonSmall { text: "×"; onClicked: createDialog.close() }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.margins: 18
                spacing: 9
                FieldLabel { text: "PROJECT NAME" }
                CrownField { id: createName; Layout.fillWidth: true; placeholderText: "My Crown Project" }
                FieldLabel { text: "LOCATION"; Layout.topMargin: 4 }
                RowLayout {
                    Layout.fillWidth: true
                    CrownField { id: createLocation; Layout.fillWidth: true }
                    FlatButton {
                        text: "Browse"
                        onClicked: {
                            let chosen = launcher.chooseProjectParent(createLocation.text)
                            if (chosen.length > 0) createLocation.text = chosen
                        }
                    }
                }
                FieldLabel { text: "TEMPLATE"; Layout.topMargin: 4 }
                ComboBox {
                    id: createTemplate
                    Layout.fillWidth: true
                    implicitHeight: 34
                    model: launcher.projectTemplates
                    textRole: "displayName"
                    valueRole: "id"
                    contentItem: Text { leftPadding: 10; text: createTemplate.displayText; color: window.textMain; verticalAlignment: Text.AlignVCenter; font.pixelSize: 12 }
                    background: Rectangle { color: "#1D1715"; border.color: createTemplate.activeFocus ? window.accent : window.line; radius: 3 }
                    popup.background: Rectangle { color: window.panelRaised; border.color: window.line }
                }
                Text {
                    Layout.fillWidth: true
                    text: createTemplate.currentIndex >= 0 && launcher.projectTemplates.length > createTemplate.currentIndex
                          ? launcher.projectTemplates[createTemplate.currentIndex].description : ""
                    color: window.textMuted
                    font.pixelSize: 10
                    wrapMode: Text.WordWrap
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 9
                    Switch {
                        id: createScripting
                        enabled: createTemplate.currentIndex >= 0
                                 && launcher.projectTemplates.length > createTemplate.currentIndex
                                 && launcher.projectTemplates[createTemplate.currentIndex].supportsScripting
                    }
                    ColumnLayout {
                        spacing: 1
                        Text { text: "Enable C# scripting"; color: createScripting.enabled ? window.textMain : "#71625C"; font.pixelSize: 11 }
                        Text { text: "Creates a project-local script assembly."; color: "#81716A"; font.pixelSize: 9 }
                    }
                    Item { Layout.fillWidth: true }
                }
                Item { Layout.fillHeight: true }
                RowLayout {
                    Layout.fillWidth: true
                    Item { Layout.fillWidth: true }
                    FlatButton { text: "Cancel"; onClicked: createDialog.close() }
                    FlatButton {
                        text: "Create Project"
                        accentButton: true
                        enabled: createName.text.trim().length > 0 && createLocation.text.length > 0 && createTemplate.currentIndex >= 0
                        onClicked: {
                            if (launcher.createProject(createName.text, createLocation.text, createTemplate.currentValue, createScripting.checked))
                                createDialog.close()
                        }
                    }
                }
            }
        }
    }

    Dialog {
        id: settingsDialog
        anchors.centerIn: Overlay.overlay
        width: 560
        height: 330
        modal: true
        padding: 0
        closePolicy: Popup.CloseOnEscape
        onOpened: defaultDirectoryField.text = launcher.defaultProjectDirectory
        background: Rectangle { color: window.panel; border.color: window.line; radius: 5 }
        contentItem: ColumnLayout {
            spacing: 0
            Rectangle {
                Layout.fillWidth: true; Layout.preferredHeight: 48; color: "#2D2420"; border.color: window.lineSoft
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 16; anchors.rightMargin: 10
                    Text { text: "Launcher Settings"; color: window.textMain; font.pixelSize: 15; font.weight: Font.DemiBold }
                    Item { Layout.fillWidth: true }
                    ToolButtonSmall { text: "×"; onClicked: settingsDialog.close() }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true; Layout.fillHeight: true; Layout.margins: 18; spacing: 9
                FieldLabel { text: "CROWNEDITOR EXECUTABLE" }
                RowLayout {
                    Layout.fillWidth: true
                    CrownField { Layout.fillWidth: true; readOnly: true; text: launcher.editorExecutable; placeholderText: "Not configured" }
                    FlatButton { text: "Choose"; onClicked: launcher.chooseEditorExecutable() }
                }
                Text { Layout.fillWidth: true; text: launcher.editorReady ? "Detected Editor " + launcher.editorVersion : "Choose the CrownEditor executable built from CrownEngine."; color: launcher.editorReady ? window.success : window.warning; font.pixelSize: 10 }
                FieldLabel { text: "DEFAULT PROJECT LOCATION"; Layout.topMargin: 8 }
                RowLayout {
                    Layout.fillWidth: true
                    CrownField { id: defaultDirectoryField; Layout.fillWidth: true }
                    FlatButton {
                        text: "Browse"
                        onClicked: {
                            let chosen = launcher.chooseProjectParent(defaultDirectoryField.text)
                            if (chosen.length > 0) defaultDirectoryField.text = chosen
                        }
                    }
                }
                Item { Layout.fillHeight: true }
                RowLayout {
                    Layout.fillWidth: true
                    Item { Layout.fillWidth: true }
                    FlatButton {
                        text: "Save"
                        accentButton: true
                        onClicked: {
                            launcher.setDefaultProjectDirectory(defaultDirectoryField.text)
                            settingsDialog.close()
                        }
                    }
                }
            }
        }
    }

    Dialog {
        id: removeDialog
        anchors.centerIn: Overlay.overlay
        width: 410
        height: 205
        modal: true
        padding: 0
        background: Rectangle { color: window.panel; border.color: window.line; radius: 5 }
        contentItem: ColumnLayout {
            anchors.margins: 18
            Text { text: "Remove from Project Manager?"; color: window.textMain; font.pixelSize: 15; font.weight: Font.DemiBold }
            Text {
                Layout.fillWidth: true
                text: "“" + (launcher.selectedProject.name || "Project") + "” will be removed from this list. Project files on disk will not be deleted."
                color: window.textMuted
                font.pixelSize: 11
                wrapMode: Text.WordWrap
            }
            Item { Layout.fillHeight: true }
            RowLayout {
                Layout.fillWidth: true
                Item { Layout.fillWidth: true }
                FlatButton { text: "Cancel"; onClicked: removeDialog.close() }
                FlatButton { text: "Remove"; dangerButton: true; onClicked: { launcher.removeSelected(); removeDialog.close() } }
            }
        }
    }

    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 18
        width: Math.min(620, errorRow.implicitWidth + 28)
        height: 42
        radius: 4
        color: "#4A2825"
        border.color: "#8E4A43"
        visible: launcher.errorMessage.length > 0
        z: 100
        RowLayout {
            id: errorRow
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 7
            spacing: 9
            Text { text: "!"; color: window.danger; font.bold: true }
            Text { Layout.fillWidth: true; text: launcher.errorMessage; color: "#F0D7D2"; font.pixelSize: 11; elide: Text.ElideRight }
            ToolButtonSmall { text: "×"; onClicked: launcher.clearError() }
        }
    }
}
