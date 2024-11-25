{ pkgs }: {
    deps = [
        pkgs.nodejs-18_x
        pkgs.chromium
        pkgs.glib
        pkgs.gtk3
        pkgs.xorg.libX11
        pkgs.xorg.libXcomposite
        pkgs.xorg.libXcursor
        pkgs.xorg.libXdamage
        pkgs.xorg.libXext
        pkgs.xorg.libXi
        pkgs.xorg.libXrender
        pkgs.xorg.libXtst
        pkgs.xorg.libxcb
        pkgs.nss
        pkgs.nspr
        pkgs.alsa-lib
        pkgs.cups
        pkgs.dbus
        pkgs.expat
        pkgs.fontconfig
        pkgs.pango
    ];
    env = {
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
        PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
        LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
            pkgs.glib
            pkgs.gtk3
        ];
    };
}