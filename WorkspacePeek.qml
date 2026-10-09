import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "PeekModel.js" as PeekModel

// workspace-peek: a big workspace number on every monitor, plus (in "peek"
// mode) a card on the focused monitor listing each workspace and its apps.
//
//   omarchy-shell shell summon evertonlm.workspace-peek '{"mode":"peek"}'
//   omarchy-shell shell hide evertonlm.workspace-peek
//
// The logic lives in PeekModel.js (unit tested); this file only draws it.
Item {
  id: root

  property bool opened: false
  property bool wanted: false          // false once close() runs, so a late fetch can't reopen
  property string mode: "peek"
  property var model: ({ focusedMonitor: "", monitors: [] })
  property var settings: PeekModel.parseSettings("")
  property bool ready: false           // no flash for the focus events fired at startup

  readonly property bool peeking: opened && mode === "peek"

  function open(payloadJson) {
    var p = PeekModel.parsePayload(payloadJson)
    if (p.mode === "flash" && peeking) return
    mode = p.mode
    hideTimer.interval = p.duration
    wanted = true
    refresh()
  }

  function close() {
    wanted = false
    opened = false
    hideTimer.stop()
  }

  // "closed", "peek" or "flash"; handy for scripts: omarchy-shell shell call evertonlm.workspace-peek state ""
  function state() { return root.opened ? root.mode : "closed" }

  function refresh() {
    fetch.running = false
    fetch.running = true
  }

  function focusWorkspace(id) {
    var cmd = PeekModel.focusCommand(id)
    if (cmd !== "") Quickshell.execDetached(["sh", "-c", cmd])
    close()
  }

  function monitorFor(screenName) {
    var list = root.model.monitors
    for (var i = 0; i < list.length; i++) if (list[i].name === screenName) return list[i]
    return null
  }

  Component.onCompleted: startupTimer.start()

  Timer { id: startupTimer; interval: 1500; onTriggered: root.ready = true }
  Timer { id: hideTimer; interval: 10000; onTriggered: root.close() }

  Process {
    id: fetch
    command: ["sh", "-c",
      "printf '{\"monitors\":'; hyprctl -j monitors; printf ',\"workspaces\":'; hyprctl -j workspaces; " +
      "printf ',\"clients\":'; hyprctl -j clients; printf '}'"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (!root.wanted) return
        try { root.model = PeekModel.buildModel(JSON.parse(text)) } catch (e) { return }
        root.opened = true
        hideTimer.restart()
      }
    }
  }

  FileView {
    path: Quickshell.env("HOME") + "/.config/workspace-peek/settings.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.settings = PeekModel.parseSettings(text())
    onFileChanged: reload()
    onLoadFailed: root.settings = PeekModel.parseSettings("")
  }

  Connections {
    target: Hyprland
    function onFocusedWorkspaceChanged() {
      if (!root.ready || !root.settings.flashOnSwitch) return
      root.open(JSON.stringify({ mode: "flash", duration: root.settings.flashDuration }))
    }
  }

  IpcHandler {
    target: "workspace-peek"
    function peek(): string { root.open('{"mode":"peek"}'); return "ok" }
    function flash(): string { root.open('{"mode":"flash"}'); return "ok" }
    function close(): string { root.close(); return "ok" }
    function state(): string { return root.state() }
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: win
      required property var modelData
      screen: modelData

      readonly property var monitor: root.monitorFor(modelData.name)
      readonly property bool isFocused: monitor !== null && monitor.focused
      readonly property bool showCard: root.peeking
      // The focused monitor's card takes the keyboard while open, so it sees
      // SUPER/Z being released in any order (a Hyprland release bind only
      // fires when the whole combo is released in order).
      readonly property bool grabsKeys: root.peeking && isFocused

      visible: root.opened && monitor !== null
      anchors { top: true; bottom: true; left: true; right: true }
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "workspace-peek"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: grabsKeys ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
      // Only the card takes clicks; everything else passes through.
      mask: Region { item: win.showCard ? card : null }

      Item {
        id: keyCatcher
        focus: win.grabsKeys
        Keys.onPressed: function(event) {
          if (PeekModel.closesPeek(event.key, "press")) { root.close(); event.accepted = true }
        }
        Keys.onReleased: function(event) {
          if (!event.isAutoRepeat && PeekModel.closesPeek(event.key, "release")) { root.close(); event.accepted = true }
        }
      }
      onGrabsKeysChanged: if (grabsKeys) keyCatcher.forceActiveFocus()

      // Big workspace number, centered on every monitor.
      BorderSurface {
        id: badge
        visible: !win.showCard
        anchors.centerIn: parent
        width: Math.max(height, badgeText.implicitWidth + Style.space(64))
        height: badgeText.implicitHeight + Style.space(32)
        radius: Style.cornerRadius
        color: Color.popups.background
        borderSpec: Border.surfaceSpec("popups", "border",
          win.isFocused ? Color.accent : Util.alpha(Color.popups.border, 0.4), Math.max(1, Style.space(3)))

        Text {
          id: badgeText
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: win.monitor ? String(win.monitor.activeWorkspace) : ""
          font.family: Style.font.family
          font.bold: true
          font.pixelSize: Style.font.displayLarge * 5
          color: win.isFocused ? Color.accent : Color.popups.text
        }
      }

      // Card: every monitor (left to right, like the desk) and its workspaces.
      BorderSurface {
        id: card
        visible: win.showCard
        anchors.centerIn: parent
        width: columns.implicitWidth + 2 * Style.spacing.panelPadding
        height: content.implicitHeight + 2 * Style.spacing.panelPadding
        radius: Style.cornerRadius
        color: Color.popups.background
        borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))

        Column {
          id: content
          anchors.centerIn: parent
          spacing: Style.spacing.panelGap

          Row {
            id: columns
            spacing: Style.space(32)

            Repeater {
              model: root.model.monitors

              Column {
                id: monitorColumn
                required property var modelData
                spacing: Style.spacing.md
                width: Style.space(300)

                Row {
                  spacing: Style.spacing.lg
                  Text {
                    textFormat: Text.PlainText
                    text: String(monitorColumn.modelData.activeWorkspace)
                    font.family: Style.font.family
                    font.bold: true
                    font.pixelSize: Style.font.displayLarge * 2
                    color: monitorColumn.modelData.focused ? Color.accent : Color.popups.text
                  }
                  Column {
                    anchors.verticalCenter: parent.verticalCenter
                    Text {
                      textFormat: Text.PlainText
                      text: monitorColumn.modelData.name + (monitorColumn.modelData.focused ? "  ●" : "")
                      font.family: Style.font.family
                      font.bold: true
                      font.pixelSize: Style.font.heading
                      color: monitorColumn.modelData.focused ? Color.accent : Color.popups.text
                    }
                    Text {
                      textFormat: Text.PlainText
                      text: monitorColumn.modelData.label
                      font.family: Style.font.family
                      font.pixelSize: Style.font.bodySmall
                      color: Util.alpha(Color.popups.text, 0.6)
                    }
                  }
                }

                Repeater {
                  model: monitorColumn.modelData.workspaces

                  Rectangle {
                    id: row
                    required property var modelData
                    width: monitorColumn.width
                    height: Style.spacing.popupRowHeight + Style.spacing.md
                    radius: Style.cornerRadius
                    color: rowMouse.containsMouse ? Style.hoverFill
                      : (row.modelData.active ? Style.selectedAccentFill : "transparent")

                    Row {
                      anchors.fill: parent
                      anchors.leftMargin: Style.spacing.rowPaddingX
                      anchors.rightMargin: Style.spacing.rowPaddingX
                      spacing: Style.spacing.lg

                      Text {
                        width: Style.space(28)
                        anchors.verticalCenter: parent.verticalCenter
                        textFormat: Text.PlainText
                        text: row.modelData.label
                        font.family: Style.font.family
                        font.bold: true
                        font.pixelSize: Style.font.title
                        color: row.modelData.active ? Color.accent : Color.popups.text
                        elide: Text.ElideRight
                      }
                      Text {
                        width: parent.width - Style.space(28) - Style.spacing.lg
                        anchors.verticalCenter: parent.verticalCenter
                        textFormat: Text.PlainText
                        text: row.modelData.summary !== "" ? row.modelData.summary : "empty"
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        color: row.modelData.summary !== "" ? Color.popups.text : Util.alpha(Color.popups.text, 0.45)
                        elide: Text.ElideRight
                      }
                    }

                    MouseArea {
                      id: rowMouse
                      anchors.fill: parent
                      hoverEnabled: true
                      cursorShape: Qt.PointingHandCursor
                      onClicked: root.focusWorkspace(row.modelData.id)
                    }
                  }
                }
              }
            }
          }

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            textFormat: Text.PlainText
            text: "Click a workspace · release SUPER or press Esc to close"
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            color: Util.alpha(Color.popups.text, 0.5)
          }
        }
      }
    }
  }
}
