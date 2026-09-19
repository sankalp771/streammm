// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StreamSession, Unauthorized, SessionNotActive, InsufficientDeposit} from "../src/StreamSession.sol";

contract AttackingPayer {
    StreamSession public stream;
    uint256 public targetSessionId;
    bool public attacked;
    bytes public reentrancyError;

    constructor(StreamSession _stream) {
        stream = _stream;
    }

    function open(bytes32 service, uint256 rate) external payable returns (uint256) {
        targetSessionId = stream.openSession{value: msg.value}(service, rate);
        return targetSessionId;
    }

    function stop() external {
        stream.stopSession(targetSessionId);
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            // Attempt to re-enter stopSession via low-level call
            (bool success, bytes memory data) = address(stream).call(
                abi.encodeWithSelector(stream.stopSession.selector, targetSessionId)
            );
            require(!success, "Reentrancy succeeded");
            reentrancyError = data;
        }
    }
}

contract ReentrantRevertingAttacker {
    StreamSession public stream;
    uint256 public targetSessionId;
    bool public attacked;

    constructor(StreamSession _stream) {
        stream = _stream;
    }

    function open(bytes32 service, uint256 rate) external payable returns (uint256) {
        targetSessionId = stream.openSession{value: msg.value}(service, rate);
        return targetSessionId;
    }

    function stop() external {
        stream.stopSession(targetSessionId);
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            // Direct call that reverts, propagating failure
            stream.stopSession(targetSessionId);
        }
    }
}

contract StreamSessionTest is Test {
    StreamSession public stream;

    address public treasury = makeAddr("treasury");
    address public settler = makeAddr("settler");
    address public payer = makeAddr("payer");
    address public stranger = makeAddr("stranger");

    bytes32 public constant SERVICE_CLAUDE = keccak256("CLAUDE");
    bytes32 public constant SERVICE_IMAGE = keccak256("IMAGE");

    uint256 public constant RATE_PER_SEC = 0.010 ether; // 0.010 MON/s
    uint256 public constant MAX_BUDGET = 0.100 ether;   // 0.100 MON (10 seconds max)

    function setUp() public {
        vm.deal(payer, 10 ether);
        vm.deal(stranger, 10 ether);
        stream = new StreamSession(treasury, settler);
    }

    function test_AccrualMatchesRateTimesElapsed() public {
        vm.startPrank(payer);
        uint256 id = stream.openSession{value: MAX_BUDGET}(SERVICE_CLAUDE, RATE_PER_SEC);
        vm.stopPrank();

        // Advance time by 4 seconds
        vm.warp(block.timestamp + 4);

        assertEq(stream.accrued(id), 4 * RATE_PER_SEC);
        assertEq(stream.remaining(id), MAX_BUDGET - (4 * RATE_PER_SEC));
    }

    function test_AccrualCapsAtMaxBudget() public {
        vm.startPrank(payer);
        uint256 id = stream.openSession{value: MAX_BUDGET}(SERVICE_CLAUDE, RATE_PER_SEC);
        vm.stopPrank();

        // Advance time by 20 seconds (well past the 10s budget cap)
        vm.warp(block.timestamp + 20);

        assertEq(stream.accrued(id), MAX_BUDGET);
        assertEq(stream.remaining(id), 0);
    }

    function test_StopSettlesAndRefundsExactly() public {
        vm.startPrank(payer);
        uint256 id = stream.openSession{value: MAX_BUDGET}(SERVICE_IMAGE, RATE_PER_SEC);
        vm.stopPrank();

        // Advance time by 6 seconds
        vm.warp(block.timestamp + 6);
        uint256 expectedAccrued = 6 * RATE_PER_SEC;
        uint256 expectedRefund = MAX_BUDGET - expectedAccrued;

        uint256 payerBalBefore = payer.balance;
        uint256 treasuryBalBefore = treasury.balance;

        // Settler calls stopSession on behalf of gateway
        vm.prank(settler);
        stream.stopSession(id);

        assertEq(treasury.balance - treasuryBalBefore, expectedAccrued);
        assertEq(payer.balance - payerBalBefore, expectedRefund);
        assertEq(stream.accrued(id), expectedAccrued);
        assertEq(stream.remaining(id), 0);
    }

    function test_StopByStranger_Reverts() public {
        vm.prank(payer);
        uint256 id = stream.openSession{value: MAX_BUDGET}(SERVICE_CLAUDE, RATE_PER_SEC);

        vm.prank(stranger);
        vm.expectRevert(Unauthorized.selector);
        stream.stopSession(id);
    }

    function test_StopTwice_Reverts() public {
        vm.prank(payer);
        uint256 id = stream.openSession{value: MAX_BUDGET}(SERVICE_CLAUDE, RATE_PER_SEC);

        vm.prank(payer);
        stream.stopSession(id);

        vm.prank(payer);
        vm.expectRevert(SessionNotActive.selector);
        stream.stopSession(id);
    }

    function test_IsAuthorizedFalseWhenExhausted() public {
        vm.prank(payer);
        uint256 id = stream.openSession{value: MAX_BUDGET}(SERVICE_CLAUDE, RATE_PER_SEC);

        assertTrue(stream.isAuthorized(id, payer));

        // Advance to 5 seconds: still within budget
        vm.warp(block.timestamp + 5);
        assertTrue(stream.isAuthorized(id, payer));

        // Advance to 10 seconds: accrued == maxBudget, exhausted!
        vm.warp(block.timestamp + 5);
        assertFalse(stream.isAuthorized(id, payer));

        // Stranger should never be authorized
        assertFalse(stream.isAuthorized(id, stranger));
    }

    function test_ReentrantStop_Reverts() public {
        AttackingPayer attacker = new AttackingPayer(stream);
        vm.deal(address(attacker), 1 ether);

        attacker.open{value: MAX_BUDGET}(SERVICE_CLAUDE, RATE_PER_SEC);
        vm.warp(block.timestamp + 3);

        // Attacker attempts to re-enter inside receive()
        attacker.stop();

        // The subcall in receive() must have reverted with SessionNotActive because of CEI
        assertEq(attacker.reentrancyError(), abi.encodeWithSelector(SessionNotActive.selector));
    }
}