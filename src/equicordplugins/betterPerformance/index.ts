/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { EquicordDevs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { MessageCache, MessageStore, SelectedChannelStore } from "@webpack/common";

const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const settings = definePluginSettings({
    assetNuke: {
        type: OptionType.BOOLEAN,
        description: "Block loading of all remote assets (images, avatars, banners, icons, emojis, stickers, media attachments, and decorations).",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeAvatarDecorations: {
        type: OptionType.BOOLEAN,
        description: "Remove avatar decorations and profile frames across the client.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeProfileEffects: {
        type: OptionType.BOOLEAN,
        description: "Remove profile effects and banner animations.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeNameplates: {
        type: OptionType.BOOLEAN,
        description: "Remove nameplates from the member list and user areas.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeShopImages: {
        type: OptionType.BOOLEAN,
        description: "Block loading and display of images, previews, and banners in the shop.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeQuestImages: {
        type: OptionType.BOOLEAN,
        description: "Block loading and display of images, banners, partner logos, and reward previews in quests.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeAnimations: {
        type: OptionType.BOOLEAN,
        description: "Disable all animations across Discord (animated avatars, server icons, status emojis, banners, role gradients, and UI animations).",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    pruneMessageCache: {
        type: OptionType.BOOLEAN,
        description: "Limit message memory cache in RAM by pruning message history from inactive channels.",
        default: false
    },
    backgroundThrottle: {
        type: OptionType.BOOLEAN,
        description: "Throttle frame rates, pause animations, and reduce CPU usage when Discord is minimized or in the background.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    disableTypingIndicators: {
        type: OptionType.BOOLEAN,
        description: "Disable typing indicator text and animations in chat to prevent constant React re-renders.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    disableSoundboardPreload: {
        type: OptionType.BOOLEAN,
        description: "Prevent automatic background downloading and audio buffer caching of soundboard audio clips.",
        default: false
    },
    disableStickerAnimations: {
        type: OptionType.BOOLEAN,
        description: "Disable animated Lottie and APNG sticker players in chat and message streams.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    disableKrisp: {
        type: OptionType.BOOLEAN,
        description: "Prevent Krisp runtime and noise cancellation module (discord_krisp) from downloading, initializing, or running.",
        default: false
    },
    removeUnnecessaryCss: {
        type: OptionType.BOOLEAN,
        description: "Remove unnecessary CSS (box shadows, backdrop blurs, text shadows, heavy transitions, and gradient effects) for maximum performance.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    },
    removeCornersAndTransparency: {
        type: OptionType.BOOLEAN,
        description: "Remove rounded corners (border-radius), transparency layers, and clipping masks for minimal GPU/CPU compositing overhead.",
        default: false,
        onChange: () => {
            updateStyles();
        }
    }
});

let isWindowBlurred = false;

function isShopActive(): boolean {
    if (typeof location !== "undefined") {
        if (location.pathname.includes("shop") || location.href.includes("shop") || location.pathname.includes("collectibles")) {
            return true;
        }
    }
    if (typeof document !== "undefined") {
        if (document.querySelector('[class*="shop_"], [class*="collectibles_"], [class*="shopPage"], [class*="shopView"], [data-list-id="shop"], [aria-label*="Shop"]')) {
            return true;
        }
    }
    return false;
}

let dynamicStyleElement: HTMLStyleElement | undefined;

function generateDynamicCss(): string {
    const isNuked = settings.store.assetNuke;
    const noAvatarDecorations = settings.store.removeAvatarDecorations || isNuked;
    const noProfileEffects = settings.store.removeProfileEffects || isNuked;
    const noNameplates = settings.store.removeNameplates || isNuked;
    const noShopImages = settings.store.removeShopImages || isNuked;
    const noQuestImages = settings.store.removeQuestImages || isNuked;
    const noAnimations = settings.store.removeAnimations;
    const noTyping = settings.store.disableTypingIndicators;
    const noStickerAnimations = settings.store.disableStickerAnimations;
    const noUnnecessaryCss = settings.store.removeUnnecessaryCss;
    const noCornersAndTransparency = settings.store.removeCornersAndTransparency;
    const throttleBackground = settings.store.backgroundThrottle && isWindowBlurred;

    const rules: string[] = [];

    if (isNuked) {
        rules.push(`
            [class*="bannerSVG"],
            [class*="banner_"] {
                background-image: none !important;
            }
        `);
    }

    if (noAvatarDecorations) {
        rules.push(`
            [class*="avatarDecoration"],
            [class*="avatarDecoration_"],
            img[class*="avatarDecoration"],
            svg[class*="avatarDecoration"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                width: 0 !important;
                height: 0 !important;
            }
        `);
    }

    if (noProfileEffects) {
        rules.push(`
            [class*="profileEffects"],
            [class*="profileEffect_"],
            [class*="collectibleAnimation"] {
                display: none !important;
                background-image: none !important;
            }
        `);
    }

    if (noNameplates) {
        rules.push(`
            [class*="nameplate_"],
            [class*="nameplateContainer"] {
                display: none !important;
            }
        `);
    }

    if (noShopImages) {
        rules.push(`
            [class*="shop"] img,
            [class*="shop"] video,
            [class*="shop"] canvas,
            [class*="shop"] svg,
            [class*="collectibles"] img,
            [class*="collectibles"] video,
            [class*="collectibles"] canvas,
            [class*="collectibles"] svg,
            [class*="productCard"] img,
            [class*="productCard"] video,
            [class*="productCard"] canvas,
            [class*="heroCard"] img,
            [class*="heroCard"] video,
            [class*="heroCard"] canvas,
            [aria-label*="Shop"] img,
            [aria-label*="Shop"] video,
            [aria-label*="Shop"] canvas {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                width: 0 !important;
                height: 0 !important;
            }

            [class*="shop"] *,
            [class*="collectibles"] *,
            [aria-label*="Shop"] * {
                background-image: none !important;
            }
        `);
    }

    if (noQuestImages) {
        rules.push(`
            [class*="quest"] img,
            [class*="quest"] video,
            [class*="quest"] canvas,
            [class*="quest_"] img,
            [class*="quest_"] video,
            [class*="quest_"] canvas,
            [class*="partnerBranding"] img,
            [class*="rewardTile"] img,
            [class*="rewardTile"] video,
            [class*="rewardDescription"] img,
            [class*="rewardDescription"] video {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                width: 0 !important;
                height: 0 !important;
            }

            [class*="quest"] *,
            [class*="rewardTile"] * {
                background-image: none !important;
            }
        `);
    }

    if (noTyping) {
        rules.push(`
            [class*="typing_"],
            [class*="typingDots"] {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
            }
        `);
    }

    if (noStickerAnimations) {
        rules.push(`
            [class*="sticker_"] canvas,
            [class*="lottieCanvas"],
            [class*="stickerNode"] canvas {
                animation-play-state: paused !important;
            }
        `);
    }

    if (noAnimations || throttleBackground) {
        rules.push(`
            *,
            *::before,
            *::after {
                animation: none !important;
                transition: none !important;
                animation-duration: 0s !important;
                transition-duration: 0s !important;
                animation-iteration-count: 0 !important;
            }
        `);
    }

    if (noUnnecessaryCss) {
        rules.push(`
            *,
            *::before,
            *::after {
                box-shadow: none !important;
                text-shadow: none !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                filter: none !important;
                transition-duration: 0s !important;
                animation-duration: 0.001s !important;
            }

            [class*="gradient"],
            [class*="glow"],
            [class*="shine"],
            [class*="shimmer"] {
                background-image: none !important;
                box-shadow: none !important;
            }
        `);
    }

    if (noCornersAndTransparency) {
        rules.push(`
            :not(svg):not(path) {
                border-radius: 0 !important;
            }

            [class*="rounded"],
            [class*="pill_"],
            [class*="badge"],
            [class*="avatar_"],
            [class*="guildIcon_"],
            [class*="blobContainer_"],
            [class*="wrapper_"] {
                border-radius: 0 !important;
                mask: none !important;
                -webkit-mask: none !important;
                clip-path: none !important;
            }

            [class*="popout_"],
            [class*="modal_"],
            [class*="layer_"],
            [class*="menu_"],
            [class*="tooltip_"],
            [class*="sidebar_"],
            [class*="panels_"] {
                border-radius: 0 !important;
                opacity: 1 !important;
                background-color: var(--background-floating, var(--background-secondary, #2b2d31)) !important;
            }
        `);
    }

    return rules.join("\n");
}

function updateStyles(): void {
    if (!dynamicStyleElement) {
        dynamicStyleElement = createAndAppendStyle("vc-better-performance-dynamic", managedStyleRootNode);
    }
    dynamicStyleElement.textContent = generateDynamicCss();
}

function pruneInactiveMessageCaches(): void {
    if (!settings.store.pruneMessageCache) return;
    const currentChannelId = SelectedChannelStore?.getChannelId();
    if (!currentChannelId) return;

    if (MessageCache?._channelMessages && typeof MessageCache._channelMessages === "object") {
        for (const channelId of Object.keys(MessageCache._channelMessages)) {
            if (channelId !== currentChannelId) {
                delete MessageCache._channelMessages[channelId];
            }
        }
    }

    if (MessageStore) {
        const ms = MessageStore as { _channelMessages?: Record<string, unknown>; };
        if (ms._channelMessages && typeof ms._channelMessages === "object") {
            for (const channelId of Object.keys(ms._channelMessages)) {
                if (channelId !== currentChannelId) {
                    delete ms._channelMessages[channelId];
                }
            }
        }
    }
}

let pruneInterval: NodeJS.Timeout | undefined;
let originalRaf: typeof window.requestAnimationFrame | undefined;
let lastRafTime = 0;

function setupRafThrottle(): void {
    if (originalRaf) return;
    originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback: FrameRequestCallback): number {
        if (settings.store.backgroundThrottle && isWindowBlurred) {
            const now = performance.now();
            if (now - lastRafTime < 66) {
                return (originalRaf as typeof window.requestAnimationFrame)(callback);
            }
            lastRafTime = now;
        }
        return (originalRaf as typeof window.requestAnimationFrame)(callback);
    };
}

function restoreRafThrottle(): void {
    if (originalRaf) {
        window.requestAnimationFrame = originalRaf;
        originalRaf = undefined;
    }
}

function onBlur(): void {
    isWindowBlurred = true;
    updateStyles();
}

function onFocus(): void {
    isWindowBlurred = false;
    updateStyles();
}

function onVisibilityChange(): void {
    isWindowBlurred = document.hidden;
    updateStyles();
}

export default definePlugin({
    name: "BetterPerformance",
    description: "Maximum performance optimizations for Discord: RAM cache pruning, background CPU throttling, noise cancellation blocking, asset nuking, and granular cosmetic strippers.",
    tags: ["Utility", "Media", "Appearance", "Voice"],
    authors: [EquicordDevs.tt],
    settings,

    patches: [
        // Image component (Asset Nuke, Shop Images & Quest Images)
        {
            find: ".handleImageLoad)",
            replacement: {
                match: /getSrc\((\i)\)\{/,
                replace: "$&if($self.shouldBlockImageSrc($1))return \"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7\";"
            }
        },
        // Disable animated icons/avatars (Opposite of AlwaysAnimate)
        {
            find: "canAnimate:",
            all: true,
            noWarn: true,
            replacement: {
                match: /canAnimate:.+?([,}].*?\))/g,
                replace: (m, rest) => {
                    const destructuringMatch = rest.match(/}=.+/);
                    if (destructuringMatch == null) return `canAnimate:!$self.shouldBlockAnimations()&&Boolean${rest}`;
                    return m;
                }
            }
        },
        // Disable status emoji animations
        {
            find: "#{intl::GUILD_OWNER}),children:",
            replacement: {
                match: /(\.CUSTOM_STATUS.+?animateEmoji:)\i/,
                replace: "$1($self.shouldBlockAnimations()?false:$&)"
            }
        },
        // Disable server banner animation
        {
            find: "#{intl::DISCOVERABLE_GUILD_HEADER_PUBLIC_INFO}",
            replacement: {
                match: /(guildBanner:\i,animate:)\i(?=}\):null)/,
                replace: "$1($self.shouldBlockAnimations()?false:$&)"
            }
        },
        // Disable gradient roles in chat
        {
            find: "=!1,contentOnly:",
            replacement: {
                match: /animate:(\i)/,
                replace: "animate:($self.shouldBlockAnimations()?false:$1)"
            }
        },
        // Disable gradient roles in member list
        {
            find: '="left",className:',
            replacement: {
                match: /,animateGradient:(\i)/,
                replace: ",animateGradient:($self.shouldBlockAnimations()?false:$1)"
            }
        },
        // Disable role gradients globally
        {
            find: "animateGradient:",
            all: true,
            noWarn: true,
            replacement: {
                match: /animateGradient:.+?([,}].*?\))/g,
                replace: (m, rest) => {
                    const destructuringMatch = rest.match(/}=.+/);
                    if (destructuringMatch == null) return `animateGradient:!$self.shouldBlockAnimations()&&Boolean${rest}`;
                    return m;
                }
            }
        },
        // Block Krisp module loading on Desktop
        {
            find: "Failed to load Krisp module",
            replacement: {
                match: /await \i\.\i\.ensureModule\("discord_krisp"\)/,
                replace: "if($self.shouldBlockKrisp())throw new Error('Krisp runtime blocked');$&"
            }
        },
        // Block Krisp browser models on Web
        {
            find: "krisp_browser_models",
            replacement: {
                match: /if\(this\._noiseCancellation\)/,
                replace: "if(!$self.shouldBlockKrisp()&&this._noiseCancellation)"
            }
        },
        // Set Krisp noise cancellation to unsupported
        {
            find: "isNoiseCancellationSupported(){",
            replacement: {
                match: /isNoiseCancellationSupported\(\)\{/,
                replace: "$&if($self.shouldBlockKrisp())return false;"
            }
        },
        // Avatar decoration URL resolver (Member list, chat, popouts)
        {
            find: "getAvatarDecorationURL:",
            replacement: {
                match: /(?<=function \i\((\i)\)\{)(?=.{0,20}let\{avatarDecoration)/,
                replace: "if($self.shouldBlockAvatarDecorations())return null;"
            }
        },
        // Avatar decorations animation hook
        {
            find: "isAvatarDecorationAnimating:",
            replacement: {
                match: /(?<=\{avatarDecoration:.{0,40}?)(void 0!==\i\?\i:)\i(?=\)?,canAnimate:)/,
                replace: "$self.shouldBlockAvatarDecorations() ? null : $&"
            }
        },
        // Profile effects (Disable Profile Effects & Shop Previews)
        {
            find: "bannerAdjustment,isHovering",
            replacement: {
                match: /\i=function\((\i)\)\{(?=.{0,50}\.useReducedMotion\))/,
                replace: "$&if($self.shouldBlockProfileEffect($1))return null;"
            }
        },
        // Nameplates (Disable Nameplates)
        {
            find: ".MINI_PREVIEW,[",
            replacement: {
                match: /function \i\((\i)\)\{(?=let.{1,5}\{nameplate:\i,)/,
                replace: '$&if($self.shouldBlockNameplates()&&$1.placement!=="preview"&&$1.placement!=="mini_preview")return null;'
            }
        },
        // Server icon and User avatar hooks in IconUtils
        {
            find: "getUserAvatarURL:",
            replacement: [
                {
                    match: /(getUserAvatarURL:)(\i),/,
                    replace: "$1$self.getUserAvatarHook($2),"
                },
                {
                    match: /(getGuildMemberAvatarURLSimple:)(\i),/,
                    replace: "$1$self.getGuildMemberAvatarHook($2),"
                },
                {
                    match: /(getGuildIconURL:)(\i),/,
                    replace: "$1$self.getGuildIconHook($2),"
                },
                {
                    match: /(getChannelIconURL:)(\i),/,
                    replace: "$1$self.getChannelIconHook($2),"
                },
                {
                    match: /(getGuildBannerURL:)(\i),/,
                    replace: "$1$self.getGuildBannerHook($2),"
                },
                {
                    match: /(getEmojiURL:)(\i),/,
                    replace: "$1$self.getEmojiHook($2),"
                }
            ]
        }
    ],

    shouldBlockKrisp(): boolean {
        return settings.store.disableKrisp;
    },

    shouldBlockAnimations(): boolean {
        return settings.store.removeAnimations;
    },

    shouldBlockImageSrc(src?: unknown): boolean {
        if (settings.store.assetNuke) return true;
        if (settings.store.removeShopImages) {
            if (isShopActive()) {
                return true;
            }
            if (typeof src === "string" && (
                src.includes("profile-effect") ||
                src.includes("profile_effect") ||
                src.includes("avatar-decoration") ||
                src.includes("avatar_decoration") ||
                src.includes("collectibles") ||
                src.includes("app-assets") ||
                src.includes("/shop") ||
                src.includes("nameplates")
            )) {
                return true;
            }
        }
        if (settings.store.removeQuestImages) {
            if (location.pathname.includes("/quest") || location.pathname.includes("/discovery/quests")) {
                return true;
            }
            if (typeof src === "string" && (
                src.includes("/quest-assets/") ||
                src.includes("/quests/") ||
                src.includes("/quest/")
            )) {
                return true;
            }
        }
        if (settings.store.disableSoundboardPreload) {
            if (typeof src === "string" && src.includes("soundboard-sounds")) {
                return true;
            }
        }
        return false;
    },

    shouldBlockAvatarDecorations(): boolean {
        return settings.store.removeAvatarDecorations || settings.store.assetNuke;
    },

    shouldBlockProfileEffect(props: { shopPreview?: boolean; } | undefined): boolean {
        if (props?.shopPreview) {
            return settings.store.removeShopImages || settings.store.assetNuke;
        }
        return settings.store.removeProfileEffects || settings.store.assetNuke;
    },

    shouldBlockNameplates(): boolean {
        return settings.store.removeNameplates || settings.store.assetNuke;
    },

    getUserAvatarHook: (original: (user: unknown, canAnimate?: boolean, size?: number) => string) => (user: unknown, canAnimate?: boolean, size?: number): string => {
        if (settings.store.assetNuke) {
            return EMPTY_IMAGE;
        }
        const allowAnimate = settings.store.removeAnimations ? false : canAnimate;
        return original(user, allowAnimate, size);
    },

    getGuildMemberAvatarHook: (original: (config: unknown) => string) => (config: unknown): string => {
        if (settings.store.assetNuke) {
            return EMPTY_IMAGE;
        }
        return original(config);
    },

    getGuildIconHook: (original: (guild: unknown, canAnimate?: boolean, size?: number) => string | null | undefined) => (guild: unknown, canAnimate?: boolean, size?: number): string | null | undefined => {
        if (settings.store.assetNuke) {
            return null;
        }
        const allowAnimate = settings.store.removeAnimations ? false : canAnimate;
        return original(guild, allowAnimate, size);
    },

    getChannelIconHook: (original: (channel: unknown, canAnimate?: boolean, size?: number) => string | null | undefined) => (channel: unknown, canAnimate?: boolean, size?: number): string | null | undefined => {
        if (settings.store.assetNuke) {
            return null;
        }
        const allowAnimate = settings.store.removeAnimations ? false : canAnimate;
        return original(channel, allowAnimate, size);
    },

    getGuildBannerHook: (original: (guild: unknown, canAnimate?: boolean, size?: number) => string | null | undefined) => (guild: unknown, canAnimate?: boolean, size?: number): string | null | undefined => {
        if (settings.store.assetNuke) {
            return null;
        }
        const allowAnimate = settings.store.removeAnimations ? false : canAnimate;
        return original(guild, allowAnimate, size);
    },

    getEmojiHook: (original: (emoji: unknown) => string) => (emoji: unknown): string => {
        if (settings.store.assetNuke) {
            return EMPTY_IMAGE;
        }
        return original(emoji);
    },

    start() {
        updateStyles();
        setupRafThrottle();

        if (typeof window !== "undefined") {
            window.addEventListener("blur", onBlur);
            window.addEventListener("focus", onFocus);
            document.addEventListener("visibilitychange", onVisibilityChange);
        }

        pruneInterval = setInterval(() => {
            pruneInactiveMessageCaches();
        }, 15000);
    },

    stop() {
        if (dynamicStyleElement) {
            dynamicStyleElement.remove();
            dynamicStyleElement = undefined;
        }

        if (pruneInterval) {
            clearInterval(pruneInterval);
            pruneInterval = undefined;
        }

        if (typeof window !== "undefined") {
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        }

        restoreRafThrottle();
    }
});
