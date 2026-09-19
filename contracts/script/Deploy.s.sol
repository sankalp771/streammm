// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StreamSession} from "../src/StreamSession.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();
        new StreamSession();
        vm.stopBroadcast();
    }
}