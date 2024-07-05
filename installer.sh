#!/bin/sh

yellow=`echo "\033[01;33m"`
green=`echo "\033[01;32m"`
red=`echo "\033[01;31m"`
white=`echo "\033[m"`

GUPPY_DIR="${HOME}/guppyflo"

stop_and_remove_service() {
    if [ -f "/etc/init.d/S99guppyflo" ]; then
        GUPPY_DIR=/usr/data/guppyflo
        /etc/init.d/S99guppyflo stop &> /dev/null
    fi

    if [ -f "/etc/systemd/system/guppyflo.service" ]; then
        systemctl stop guppyflo
    fi

    if [ -d "$GUPPY_DIR" ]; then
        rm -rf "$GUPPY_DIR/fluidd" "$GUPPY_DIR/mainsail" "$GUPPY_DIR/services" "$GUPPY_DIR/www" "$GUPPY_DIR/guppyflo"
    fi
}

substitute_service_template() {
    if [ "$1" = "tcpproxy" ]; then
        sed -i "s|%USER%|$USER|g; s|%WORK_DIR%|$GUPPY_DIR|g; s|%GUPPY_EXEC%|$GUPPY_DIR/guppyflo -tcpproxy|g" $GUPPY_DIR/services/guppyflo.service
    else
        sed -i "s|%USER%|$USER|g; s|%WORK_DIR%|$GUPPY_DIR|g; s|%GUPPY_EXEC%|$GUPPY_DIR/guppyflo|g" $GUPPY_DIR/services/guppyflo.service
    fi
}

install_services() {
    sudo cp ${HOME}/guppyflo/services/guppyflo.service /etc/systemd/system
    sudo ln -sf $GUPPY_DIR/services/proxies.json $GUPPY_DIR/proxies.json
    sudo systemctl enable guppyflo.service
    printf "${green}Configuring GuppyFLO services ${white}\n"
}


restart_service() {
    printf "${green}Restarting GuppyFLO service ${white}\n"
    rm $GUPPY_DIR/guppyflo.log &> /dev/null
    systemctl restart guppyflo

    display_post_install_instruction $1
}

install_buildroot_service() {
    GUPPY_DIR=/usr/data/guppyflo

    if [ "$1" = "tcpproxy" ]; then
        printf "${green}Configuring GuppyFLO services as TCP Proxy${white}\n"
        ln -sf $GUPPY_DIR/services/S99guppyflo.tcpproxy /etc/init.d/S99guppyflo
        ln -sf $GUPPY_DIR/services/proxies.json $GUPPY_DIR/proxies.json
    else
        printf "${green}Configuring GuppyFLO services as HTTP Reverse Proxy${white}\n"
        ln -sf $GUPPY_DIR/services/S99guppyflo /etc/init.d/S99guppyflo
    fi
    ln -sf $GUPPY_DIR/services/respawn/libeinfo.so.1 /lib/libeinfo.so.1
    ln -sf $GUPPY_DIR/services/respawn/librc.so.1 /lib/librc.so.1
}

restart_buildroot_service() {
    GUPPY_DIR=/usr/data/guppyflo

    printf "${green}Restarting GuppyFLO service. Please wait...${white}\n\n"
    rm $GUPPY_DIR/guppyflo.log &> /dev/null
    /etc/init.d/S99guppyflo restart &> /dev/null

    display_post_install_instruction $1
}

display_post_install_instruction() {
    TS_AUTH_URL=$(grep -o -m 1 "https://login.tailscale.com/.*" $GUPPY_DIR/guppyflo.log 2>/dev/null || echo "")

    for i in `seq 1 10`; do
	if [ ! -z "$TS_AUTH_URL" ]; then
            printf "1. Open following tailscale authenticaton URL to add this printer to your tailnet:\n"
            printf "$TS_AUTH_URL\n\n"
            printf "2. Enable Tailscale MagicDNS:\n"
            printf "https://login.tailscale.com/admin/dns\n\n"
            printf "3. Download the tailscale client, sign-in, and connect your client to your tailnet:\n"
            printf "https://tailscale.com/download\n\n"
            if [ "$1" = "tcpproxy" ]; then
            printf "4. Remote access fluidd at:\n"
            printf "http://guppyflo\n\n"
            printf "5. Remote accees mainsail at:\n"
            printf "http://guppyflo:81\n\n"
            else
                printf "4. Access GuppyFLO UI at <this-host-ip>:9873 at:\n"
                printf "http://<this-host-ip>:9873\n\n"
            fi
            printf "For detail GuppyFLO guide checkout the project page:\n"
            printf "https://github.com/ballaswag/guppyflo\n\n"
            break;
	fi

	sleep 2
	TS_AUTH_URL=$(grep -o -m 1 "https://login.tailscale.com/.*" $GUPPY_DIR/guppyflo.log 2>/dev/null || echo "")
    done
}

ARCH=`uname -m`
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "armv7l" ]; then
    printf "${green}Installing GuppyFLO ${white}\n"

    ASSET="guppyflo_armv6.zip"
    if [ "$ARCH" = "x86_64" ]; then
	ASSET="guppyflo_x86_64.zip"
    fi
    
    curl -L https://github.com/ballaswag/guppyflo/releases/latest/download/$ASSET -o /tmp/guppyflo.zip
    stop_and_remove_service
    mkdir -p $GUPPY_DIR
    unzip /tmp/guppyflo.zip -d $GUPPY_DIR

    substitute_service_template $1
    install_services
    restart_service $1

    printf "${green}Successfully installed GuppyFLO ${white}\n"
elif [ "$ARCH" = "mips" ]; then
    ASSET="guppyflo_mipsle.zip"
    GUPPY_DIR=/usr/data/guppyflo

    mkdir -p $GUPPY_DIR

    ## bootstrap for ssl support
    wget -q --no-check-certificate https://raw.githubusercontent.com/ballaswag/k1-discovery/main/bin/curl -O /tmp/curl
    chmod +x /tmp/curl

    /tmp/curl -L https://github.com/ballaswag/guppyflo/releases/latest/download/$ASSET -o /tmp/guppyflo.zip
    stop_and_remove_service
    unzip /tmp/guppyflo.zip -d $GUPPY_DIR
    
    install_buildroot_service $1
    restart_buildroot_service $1

    printf "${green}Successfully installed GuppyFLO ${white}\n"
else
    printf "${red}Terminating... Your OS Platform has not been tested with GuppyFLO ${white}\n"
    exit 1
fi
