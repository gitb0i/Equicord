/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { playAudio } from "@api/AudioPlayer";
import { ApplicationCommandOptionType, findOption } from "@api/Commands";
import { type NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Notifications } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs, EquicordDevs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Message } from "@vencord/discord-types";
import { findLazy } from "@webpack";
import { ChannelActionCreators, ChannelActions, ChannelStore, createRoot, Menu, MessageStore, NavigationRouter, PresenceStore, UserStore, WindowStore } from "@webpack/common";
import { JSX } from "react";
import type { Root } from "react-dom/client";

interface IMessageCreate {
    channelId: string;
    guildId: string;
    message: Message;
}

interface ICallCreate {
    channelId: string;
    ringing?: string[];
    messageId?: string;
    region?: string;
    call?: {
        channel_id: string;
        ringing: string[];
    };
}

const SILENT_PING_FLAG = 1 << 12;
const logger = new Logger("BypassStatus");

let activeAudio: HTMLAudioElement | null = null;
let activeCallChannelId: string | null = null;
let callContainer: HTMLDivElement | null = null;
let callRoot: Root | null = null;

function Icon(enabled?: boolean): JSX.Element {
    return <svg
        width="18"
        height="18"
    >
        <circle cx="9" cy="9" r="8" fill={!enabled ? "var(--status-danger)" : "currentColor"} />
        <circle cx="9" cy="9" r="3.75" fill={!enabled ? "white" : "black"} />
    </svg>;
}

function processIds(value: string): string {
    return value.replace(/\s/g, "").split(",").filter(id => id.trim() !== "").join(", ");
}

function getRingtoneUrl(): string {
    try {
        const soundFinder = findLazy((m: { resolve?: (k: string) => string; id?: string; keys?: () => string[]; }) =>
            Boolean(m?.resolve && m?.id && m.keys?.().some(k => k.endsWith(".mp3"))), false);
        if (soundFinder) {
            return soundFinder("./call_ringing.mp3");
        }
    } catch {}
    return "https://canary.discord.com/assets/3b3a2f5f29b9cb656efb.mp3";
}

function getChannelRecipients(channel: Channel): string[] {
    const list: string[] = [];
    const directRecipient = channel.getRecipientId?.();
    if (directRecipient) {
        list.push(directRecipient);
    }
    const { recipients, rawRecipients } = channel as { recipients?: Array<string | { id: string; }>; rawRecipients?: Array<{ id: string; }>; };
    if (recipients && Array.isArray(recipients)) {
        for (const r of recipients) {
            if (typeof r === "string" && !list.includes(r)) list.push(r);
            else if (typeof r === "object" && r?.id && !list.includes(r.id)) list.push(r.id);
        }
    }
    if (rawRecipients && Array.isArray(rawRecipients)) {
        for (const r of rawRecipients) {
            if (r?.id && !list.includes(r.id)) list.push(r.id);
        }
    }
    return list;
}

function getCallerInfo(channel: Channel): { name: string; avatar?: string; } {
    const { name } = channel;
    let callerName = name;
    let avatar: string | undefined;

    const recipients = getChannelRecipients(channel);
    if (recipients.length > 0) {
        const user = UserStore.getUser(recipients[0]);
        if (user) {
            callerName = user.globalName || user.username;
            avatar = user.getAvatarURL?.(undefined, undefined, false);
        }
    }

    if (!callerName && (channel.type === 3 || channel.isGroupDM?.())) {
        callerName = "Group DM Call";
    }

    return { name: callerName || "Unknown Caller", avatar };
}

function IncomingCallModal({ channel, onClose }: { channel: Channel; onClose: () => void; }): JSX.Element {
    const { name: callerText, avatar: avatarUrl } = getCallerInfo(channel);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                zIndex: 2147483647,
                pointerEvents: "auto"
            }}
        >
            <div
                className="root__2dbe1 elevationHigh__2b2f1 theme-dark theme-darker images-dark"
                style={{
                    width: 250,
                    backgroundColor: "var(--background-floating, #232428)",
                    borderRadius: 16,
                    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    padding: "32px 24px 28px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontFamily: "var(--font-primary, 'gg sans', 'Noto Sans', sans-serif)",
                    userSelect: "none",
                    pointerEvents: "auto",
                    boxSizing: "border-box"
                }}
            >
                <div className="mainChannelInfo__2dbe1" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                    <div className="wrapper_f910d0 icon__2dbe1" style={{ height: 80, width: 80, display: "flex", justifyContent: "center" }}>
                        <div className="callAvatarMaskContainer_f910d0">
                            {avatarUrl ? (
                                <img
                                    alt={callerText}
                                    className="voiceAvatar_f910d0"
                                    draggable={false}
                                    src={avatarUrl}
                                    style={{
                                        width: 80,
                                        height: 80,
                                        borderRadius: "50%",
                                        objectFit: "cover",
                                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                                        display: "block"
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: "50%",
                                    backgroundColor: "var(--background-accent, #5865f2)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "white",
                                    fontSize: 32,
                                    fontWeight: 700
                                }}>
                                    {callerText.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="titleGroup__2dbe1" style={{ textAlign: "center", marginTop: 16, width: "100%" }}>
                        <div
                            className="text-lg/semibold_cf4812 title__2dbe1"
                            data-text-variant="text-lg/semibold"
                            style={{
                                color: "var(--text-strong, #f2f3f5)",
                                fontSize: 20,
                                fontWeight: 700,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 200,
                                margin: "0 auto"
                            }}
                        >
                            {callerText}
                        </div>
                        <div
                            className="text-md/normal_cf4812 subtitle__2dbe1"
                            data-text-variant="text-md/normal"
                            style={{
                                color: "var(--text-default, #949ba4)",
                                fontSize: 14,
                                marginTop: 4
                            }}
                        >
                            Incoming Call...
                        </div>
                    </div>
                </div>

                <div
                    className="wrapper__2dbe1 actions__2dbe1"
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 16,
                        marginTop: 24,
                        width: "100%"
                    }}
                >
                    <div className="attachedCaretButtonContainer_f1ceac actionButton__2dbe1">
                        <div>
                            <button
                                data-migration-pending="true"
                                aria-label="Dismiss"
                                type="button"
                                className="centerButton_f1ceac colorable_f1ceac disconnect_f1ceac fullRegionButton_f1ceac button__201d5 lookBlank__201d5 colorBrand__201d5"
                                style={{
                                    width: 58,
                                    height: 58,
                                    borderRadius: 16,
                                    backgroundColor: "var(--status-danger, #da373c)",
                                    border: "none",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "white",
                                    transition: "filter 0.15s ease",
                                    boxShadow: "0 4px 12px rgba(218, 55, 60, 0.3)"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.filter = "brightness(1.15)")}
                                onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
                                onClick={onClose}
                            >
                                <div className="contents__201d5 lineHeightReset_f1ceac">
                                    <svg className="centerIcon_f1ceac fullRegionIcon_f1ceac controlIcon_f1ceac" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24">
                                        <path fill="currentColor" d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z"></path>
                                    </svg>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="attachedCaretButtonContainer_f1ceac actionButton__2dbe1">
                        <div>
                            <button
                                data-migration-pending="true"
                                aria-label="Join Call"
                                type="button"
                                className="centerButton_f1ceac colorable_f1ceac join_f1ceac fullRegionButton_f1ceac button__201d5 lookBlank__201d5 colorBrand__201d5"
                                style={{
                                    width: 58,
                                    height: 58,
                                    borderRadius: 16,
                                    backgroundColor: "var(--status-positive, #23a55a)",
                                    border: "none",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "white",
                                    transition: "filter 0.15s ease",
                                    boxShadow: "0 4px 12px rgba(35, 165, 90, 0.3)"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.filter = "brightness(1.15)")}
                                onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
                                onClick={() => {
                                    ChannelActions.selectVoiceChannel(channel.id);
                                    NavigationRouter.transitionTo(`/channels/@me/${channel.id}`);
                                    onClose();
                                }}
                            >
                                <div className="contents__201d5 lineHeightReset_f1ceac">
                                    <svg className="centerIcon_f1ceac fullRegionIcon_f1ceac controlIcon_f1ceac" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24">
                                        <path fill="currentColor" d="M2 7.4A5.4 5.4 0 0 1 7.4 2c.36 0 .7.22.83.55l1.93 4.64a1 1 0 0 1-.43 1.25L7 10a8.52 8.52 0 0 0 7 7l1.12-2.24a1 1 0 0 1 1.19-.51l5.06 1.56c.38.11.63.46.63.85C22 19.6 19.6 22 16.66 22h-.37C8.39 22 2 15.6 2 7.71V7.4ZM13 3a1 1 0 0 1 1-1 8 8 0 0 1 8 8 1 1 0 1 1-2 0 6 6 0 0 0-6-6 1 1 0 0 1-1-1Z"></path>
                                        <path fill="currentColor" d="M13 7a1 1 0 0 1 1-1 4 4 0 0 1 4 4 1 1 0 1 1-2 0 2 2 0 0 0-2-2 1 1 0 0 1-1-1Z"></path>
                                    </svg>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function createFallbackChannel(id: string): Channel {
    const user = UserStore.getUser(id);
    return {
        id,
        type: 1,
        name: user?.globalName || user?.username || "Incoming Call",
        recipients: [id],
        getRecipientId: () => id,
        isDM: () => true,
        isGroupDM: () => false,
        isPrivate: () => true
    } as unknown as Channel;
}

function showIncomingCallModal(channel: Channel): void {
    try {
        logger.info(`Opening incoming call modal for channel ${channel.id}`);

        hideIncomingCallModal();

        callContainer = document.createElement("div");
        callContainer.id = "vc-bypass-call-root";
        callContainer.style.position = "fixed";
        callContainer.style.top = "0";
        callContainer.style.left = "0";
        callContainer.style.width = "100vw";
        callContainer.style.height = "100vh";
        callContainer.style.zIndex = "2147483647";
        callContainer.style.pointerEvents = "auto";
        document.body.appendChild(callContainer);

        callRoot = createRoot(callContainer);
        callRoot.render(
            <ErrorBoundary>
                <IncomingCallModal
                    channel={channel}
                    onClose={() => {
                        stopCallRingtone(channel.id);
                    }}
                />
            </ErrorBoundary>
        );
    } catch (error) {
        logger.error("Failed to open incoming call modal: ", error);
    }
}

function hideIncomingCallModal(): void {
    if (callRoot) {
        try {
            callRoot.unmount();
        } catch {}
        callRoot = null;
    }
    const existing = document.getElementById("vc-bypass-call-root");
    if (existing && existing.parentNode) {
        try {
            existing.parentNode.removeChild(existing);
        } catch {}
    }
    callContainer = null;
}

function startCallRingtone(channelId: string): void {
    stopCallRingtone();
    if (!settings.store.notificationSound) return;
    try {
        activeCallChannelId = channelId;
        const ringtoneUrl = getRingtoneUrl();
        activeAudio = new Audio(ringtoneUrl);
        activeAudio.loop = true;
        activeAudio.play().catch(err => {
            logger.error("Failed to play ringtone audio:", err);
        });
    } catch (error) {
        logger.error("Failed to start call ringtone: ", error);
    }
}

function stopCallRingtone(channelId?: string): void {
    if (!channelId || activeCallChannelId === channelId) {
        if (activeAudio) {
            try {
                activeAudio.pause();
                activeAudio.currentTime = 0;
                activeAudio.src = "";
            } catch {}
            activeAudio = null;
        }
        activeCallChannelId = null;
        hideIncomingCallModal();
    }
}

async function showNotification(message: Message, guildId: string | undefined): Promise<void> {
    try {
        const channel = ChannelStore.getChannel(message.channel_id);
        const channelRegex = /<#(\d{19})>/g;
        const userRegex = /<@(\d{18})>/g;

        message.content = message.content.replace(channelRegex, (_, channelId: string) => {
            return `#${ChannelStore.getChannel(channelId)?.name}`;
        });

        message.content = message.content.replace(userRegex, (_, userId: string) => {
            return `@${UserStore.getUser(userId)?.globalName || "User"}`;
        });

        const authorUser = UserStore.getUser(message.author.id);
        const authorName = message.author.globalName || message.author.username;

        await Notifications.showNotification({
            title: `${authorName} ${guildId ? `(#${channel?.name}, ${ChannelStore.getChannel(channel?.parent_id)?.name})` : ""}`,
            body: message.content,
            icon: authorUser?.getAvatarURL(undefined, undefined, false),
            onClick: function (): void {
                NavigationRouter.transitionTo(`/channels/${guildId ?? "@me"}/${message.channel_id}/${message.id}`);
            }
        });

        if (settings.store.notificationSound) {
            try { playAudio("message1"); } catch {}
        }
    } catch (error) {
        logger.error("Failed to notify user: ", error);
    }
}

async function showCallNotification(channelOrUserId: string): Promise<void> {
    try {
        let channel = ChannelStore.getChannel(channelOrUserId);
        if (!channel) {
            try {
                const privateChannelId = await ChannelActionCreators.getOrEnsurePrivateChannel(channelOrUserId);
                if (privateChannelId) {
                    channel = ChannelStore.getChannel(privateChannelId);
                }
            } catch {}
        }
        if (!channel) {
            channel = createFallbackChannel(channelOrUserId);
        }

        const channelId = channel.id;
        const { name: callerText, avatar: avatarUrl } = getCallerInfo(channel);

        showIncomingCallModal(channel);
        startCallRingtone(channelId);

        if (!WindowStore.isFocused() && typeof Notification !== "undefined") {
            await Notifications.showNotification({
                title: "Incoming Call!",
                body: `Incoming call from ${callerText}`,
                icon: avatarUrl,
                onClick: function (): void {
                    NavigationRouter.transitionTo(`/channels/@me/${channelId}`);
                    stopCallRingtone(channelId);
                }
            });
        }
    } catch (error) {
        logger.error("Failed to notify call: ", error);
    }
}

function ContextCallback(name: "guild" | "user" | "channel"): NavContextMenuPatchCallback {
    return (children, props) => {
        const type = props[name];
        if (!type) return;
        const enabled = settings.store[`${name}s`].split(", ").includes(type.id);
        if (name === "user" && type.id === UserStore.getCurrentUser()?.id) return;
        children.splice(-1, 0, (
            <Menu.MenuGroup>
                <Menu.MenuItem
                    id={`status-${name}-bypass`}
                    label={`${enabled ? "Remove" : "Add"} Status Bypass`}
                    icon={() => Icon(enabled)}
                    action={() => {
                        let bypasses: string[] = settings.store[`${name}s`].split(", ");
                        if (enabled) bypasses = bypasses.filter(id => id !== type.id);
                        else bypasses.push(type.id);
                        settings.store[`${name}s`] = bypasses.filter(id => id.trim() !== "").join(", ");
                    }}
                />
            </Menu.MenuGroup>
        ));
    };
}

async function handleIncomingCall(channelId: string, ringing?: string[]): Promise<void> {
    try {
        if (!settings.store.notifyCalls) return;

        const currentUser = UserStore.getCurrentUser();
        if (!currentUser) return;

        const userStatus = PresenceStore.getStatus(currentUser.id);
        if (userStatus !== settings.store.statusToUse) return;

        if (ringing && Array.isArray(ringing) && !ringing.includes(currentUser.id)) {
            return;
        }

        let channel = ChannelStore.getChannel(channelId);
        if (!channel) {
            await new Promise(resolve => setTimeout(resolve, 100));
            channel = ChannelStore.getChannel(channelId);
        }
        if (!channel) return;

        const allowedUsers = settings.store.users.split(", ").map(s => s.trim()).filter(Boolean);
        const allowedChannels = settings.store.channels.split(", ").map(s => s.trim()).filter(Boolean);

        if (allowedChannels.includes(channelId)) {
            await showCallNotification(channelId);
            return;
        }

        const recipients = getChannelRecipients(channel);
        if (recipients.some(id => allowedUsers.includes(id))) {
            await showCallNotification(channelId);
        }
    } catch (error) {
        logger.error("Failed to handle incoming call: ", error);
    }
}

const settings = definePluginSettings({
    guilds: {
        type: OptionType.STRING,
        description: "Guilds to let bypass (notified when pinged anywhere in guild).",
        default: "",
        placeholder: "Separate with commas",
        onChange: value => settings.store.guilds = processIds(value)
    },
    channels: {
        type: OptionType.STRING,
        description: "Channels to let bypass (notified when pinged in that channel).",
        default: "",
        placeholder: "Separate with commas",
        onChange: value => settings.store.channels = processIds(value)
    },
    users: {
        type: OptionType.STRING,
        description: "Users to let bypass (notified for all messages and calls sent in DMs).",
        default: "",
        placeholder: "Separate with commas",
        onChange: value => settings.store.users = processIds(value)
    },
    allowOutsideOfDms: {
        type: OptionType.BOOLEAN,
        description: "Allow selected users to bypass status outside of DMs too (acts like a channel/guild bypass, but it's for all messages sent by the selected users)."
    },
    notificationSound: {
        type: OptionType.BOOLEAN,
        description: "Whether the notification sound should be played.",
        default: true,
    },
    respectSilentPings: {
        type: OptionType.BOOLEAN,
        description: "Respect silent pings (@silent / suppress notifications).",
        default: true
    },
    notifyCalls: {
        type: OptionType.BOOLEAN,
        description: "Allow call notifications from bypass targets.",
        default: true
    },
    statusToUse: {
        type: OptionType.SELECT,
        description: "Status to use for whitelist.",
        options: [
            {
                label: "Online",
                value: "online",
            },
            {
                label: "Idle",
                value: "idle",
            },
            {
                label: "Do Not Disturb",
                value: "dnd",
                default: true
            },
            {
                label: "Invisible",
                value: "invisible",
            }
        ]
    }
});

export default definePlugin({
    name: "BypassStatus",
    description: "Still get notifications from specific sources when in do not disturb mode. Right-click on users/channels/guilds to set them to bypass do not disturb mode.",
    tags: ["Activity", "Customisation", "Notifications", "Servers"],
    authors: [Devs.Inbestigator, EquicordDevs.xcreepa, EquicordDevs.tt],
    dependencies: ["AudioPlayerAPI", "CommandsAPI"],
    commands: [
        {
            name: "testcall",
            description: "Test the incoming call modal and ringtone with a user ID or mention.",
            options: [
                {
                    name: "user",
                    description: "User ID or mention to simulate incoming call from.",
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                }
            ],
            async execute(args) {
                const rawUser = findOption(args, "user", "").replace(/[<@!>]/g, "").trim();
                if (!rawUser) return;
                try {
                    await showCallNotification(rawUser);
                } catch (err) {
                    logger.error("Failed to test call: ", err);
                }
            }
        }
    ],
    stop() {
        stopCallRingtone();
    },
    flux: {
        async MESSAGE_CREATE({ message, guildId, channelId }: IMessageCreate): Promise<void> {
            try {
                const currentUser = UserStore.getCurrentUser();
                if (!currentUser) return;

                const userStatus = await PresenceStore.getStatus(currentUser.id);
                const currentChannelId = getCurrentChannel()?.id ?? "0";
                if (message.state === "SENDING" || message.content === "" || message.author.id === currentUser.id || (channelId === currentChannelId && WindowStore.isFocused()) || userStatus !== settings.store.statusToUse) {
                    return;
                }
                if (settings.store.respectSilentPings && (message.flags & SILENT_PING_FLAG)) { return; }
                const mentioned = MessageStore.getMessage(channelId, message.id)?.mentioned;
                if ((settings.store.guilds.split(", ").includes(guildId) || settings.store.channels.split(", ").includes(channelId)) && mentioned) {
                    await showNotification(message, guildId);
                } else if (settings.store.users.split(", ").includes(message.author.id)) {
                    const userChannelId = await ChannelActionCreators.getOrEnsurePrivateChannel(message.author.id);
                    if (channelId === userChannelId || (mentioned && settings.store.allowOutsideOfDms === true)) {
                        await showNotification(message, guildId);
                    }
                }
            } catch (error) {
                new Logger("BypassStatus").error("Failed to handle message: ", error);
            }
        },

        async CALL_CREATE(event: ICallCreate): Promise<void> {
            const channelId = event.channelId || event.call?.channel_id;
            const ringing = event.ringing || event.call?.ringing;
            if (channelId) {
                await handleIncomingCall(channelId, ringing);
            }
        },

        CALL_DELETE({ channelId }: { channelId: string; }): void {
            if (!channelId || activeCallChannelId === channelId) {
                stopCallRingtone(channelId);
            }
        },

        async CALL_UPDATE(event: ICallCreate): Promise<void> {
            const channelId = event.channelId || event.call?.channel_id;
            const ringing = event.ringing || event.call?.ringing;
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (channelId === activeCallChannelId && ringing && currentUserId && Array.isArray(ringing) && !ringing.includes(currentUserId)) {
                stopCallRingtone(channelId);
            } else if (channelId && ringing && currentUserId && Array.isArray(ringing) && ringing.includes(currentUserId) && activeCallChannelId !== channelId) {
                await handleIncomingCall(channelId, ringing);
            }
        },

        VOICE_CHANNEL_SELECT(event?: { channelId?: string | null; }): void {
            if (event?.channelId) {
                stopCallRingtone();
            }
        }
    },
    settings,
    contextMenus: {
        "guild-context": ContextCallback("guild"),
        "channel-context": ContextCallback("channel"),
        "user-context": ContextCallback("user"),
    }
});
