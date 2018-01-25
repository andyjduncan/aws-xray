#!/usr/bin/env bash

npm install > /dev/null

BIN_PATH=`cd ./node_modules/.bin; pwd`

if [[ $PATH != *"$BIN_PATH"* ]]; then
    echo "export PATH=$PATH:$BIN_PATH"
fi

