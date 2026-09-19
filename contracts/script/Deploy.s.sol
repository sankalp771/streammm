// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StreamSession} from "../src/StreamSession.sol";

contract DeployScript is Script {
    function run() external returns (StreamSession stream) {
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address settler = vm.envOr("SETTLER_ADDRESS", address(0x8c6b4A4ac2F5f9d3d2604C073a9300c595298A32));

        console.log("Deploying StreamSession to Monad Testnet...");
        console.log("Treasury Address (profits):", treasury);
        console.log("Settler Address (hot wallet):", settler);

        vm.startBroadcast();
        stream = new StreamSession(treasury, settler);
        vm.stopBroadcast();

        console.log("StreamSession deployed successfully at:", address(stream));
    }
}