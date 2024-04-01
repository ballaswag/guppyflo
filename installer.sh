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
        service guppyflo stop
    fi

    if [ -d "$GUPPY_DIR" ]; then
        rm -rf "$GUPPY_DIR/fluidd" "$GUPPY_DIR/mainsail" "$GUPPY_DIR/services" "$GUPPY_DIR/www" "$GUPPY_DIR/guppyflo"
    fi
}

substitute_service_template() {
 	sed -i "s|%USER%|$USER|g; s|%WORK_DIR%|$GUPPY_DIR|g; s|%GUPPY_EXEC%|$GUPPY_DIR/guppyflo|g" $GUPPY_DIR/services/guppyflo.service
}

install_services() {
    sudo cp ${HOME}/guppyflo/services/guppyflo.service /etc/systemd/system
    sudo systemctl enable guppyflo.service    
    printf "${green}Configuring GuppyFLO services ${white}\n"
}


restart_service() {
    printf "${green}Restarting GuppyFLO service ${white}\n"
    service guppyflo restart
}

install_buildroot_service() {
    GUPPY_DIR=/usr/data/guppyflo

    printf "${green}Configuring GuppyFLO services ${white}\n"    
    ln -sf $GUPPY_DIR/services/S99guppyflo /etc/init.d/S99guppyflo
    ln -sf $GUPPY_DIR/services/respawn/libeinfo.so.1 /lib/libeinfo.so.1
    ln -sf $GUPPY_DIR/services/respawn/librc.so.1 /lib/librc.so.1
}

restart_buildroot_service() {
    printf "${green}Restarting GuppyFLO service ${white}\n"
    /etc/init.d/S99guppyflo restart &> /dev/null
}

ARCH=`uname -m`
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "x86_64" ]; then
    printf "${green}Installing GuppyFLO ${white}\n"

    ASSET="guppyflo_armv6.zip"
    if [ "$ARCH" = "x86_64" ]; then
	ASSET="guppyflo_x86_64.zip"
    fi
    
    curl -s -L https://github.com/ballaswag/guppyflo/releases/latest/download/$ASSET -o /tmp/guppyflo.zip
    stop_and_remove_service
    mkdir -p $GUPPY_DIR
    unzip /tmp/guppyflo.zip -d $GUPPY_DIR

    substitute_service_template
    install_services
    restart_service

    printf "${green}Successfully installed GuppyFLO ${white}\n"
elif [ "$ARCH" = "mips" ]; then
    ASSET="guppyflo_mipsle.zip"
    GUPPY_DIR=/usr/data/guppyflo

    mkdir -p $GUPPY_DIR

    ## bootstrap for ssl support
    wget -q --no-check-certificate https://raw.githubusercontent.com/ballaswag/k1-discovery/main/bin/curl -O /tmp/curl
    chmod +x /tmp/curl

    /tmp/curl -s -L https://github.com/ballaswag/guppyflo/releases/latest/download/$ASSET -o /tmp/guppyflo.zip
    stop_and_remove_service
    unzip /tmp/guppyflo.zip -d $GUPPY_DIR
    
    install_buildroot_service
    restart_buildroot_service

    printf "${green}Successfully installed GuppyFLO ${white}\n"
else
    printf "${red}Terminating... Your OS Platform has not been tested with GuppyFLO ${white}\n"
    exit 1
fi
