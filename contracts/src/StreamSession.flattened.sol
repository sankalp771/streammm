// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// src/StreamSession.sol

/// @notice Thrown when caller is not the session payer or the authorized settler.
error Unauthorized();
/// @notice Thrown when attempting to operate on an inactive or nonexistent session.
error SessionNotActive();
/// @notice Thrown when ratePerSecond is zero.
error InvalidRate();
/// @notice Thrown when deposit is less than the per-second rate.
error InsufficientDeposit();
/// @notice Thrown when native transfer to treasury or payer fails.
error TransferFailed();

/// @title StreamSession
/// @notice Continuous per-second on-chain payment and authorization layer for AI services on Monad.
/// @dev Payer escrows MON as maxBudget. Rate accrues per wall-clock second derived from block.timestamp.
contract StreamSession {
    struct Session {
        address payer;          // Payer who funded the session and receives remainder refund
        bytes32 service;        // keccak256("CLAUDE") or keccak256("IMAGE")
        uint256 ratePerSecond;  // Stream rate in wei MON per second
        uint256 maxBudget;      // Escrowed deposit in wei MON (hard liability ceiling)
        uint64 startTime;       // Block timestamp at open
        uint64 lastCheckpoint;  // Timestamp of last checkpoint (reserved)
        uint256 settledAmount;  // Final MON transferred to treasury upon settlement
        bool active;            // True while session is running and within budget
    }

    /// @notice Address receiving settled payments for AI execution
    address public immutable treasury;
    /// @notice Backend hot wallet authorized to trigger settlement upon AI job completion
    address public immutable settler;

    /// @notice Auto-incrementing session ID counter
    uint256 public nextSessionId;
    /// @notice Map of session ID to Session state
    mapping(uint256 => Session) public sessions;

    event SessionOpened(
        uint256 indexed id,
        address indexed payer,
        bytes32 indexed service,
        uint256 ratePerSecond,
        uint256 maxBudget,
        uint64 startTime
    );

    event SessionSettled(
        uint256 indexed id,
        address indexed payer,
        uint256 settledAmount,
        uint256 refundedAmount
    );

    /// @param _treasury Address to receive accrued MON
    /// @param _settler Hot wallet allowed to call stopSession on behalf of gateway
    constructor(address _treasury, address _settler) {
        require(_treasury != address(0), "Invalid treasury");
        require(_settler != address(0), "Invalid settler");
        treasury = _treasury;
        settler = _settler;
    }

    /// @notice Opens a new streaming session with escrowed MON
    /// @dev msg.value is the escrowed budget and serves as the hard ceiling on liability
    /// @param service Identifier hash of the AI service (e.g. keccak256("CLAUDE"))
    /// @param ratePerSecond Rate in wei MON charged per wall-clock second
    /// @return id Unique identifier for the created session
    function openSession(bytes32 service, uint256 ratePerSecond) external payable returns (uint256 id) {
        if (ratePerSecond == 0) revert InvalidRate();
        if (msg.value < ratePerSecond) revert InsufficientDeposit();

        id = nextSessionId++;
        sessions[id] = Session({
            payer: msg.sender,
            service: service,
            ratePerSecond: ratePerSecond,
            maxBudget: msg.value,
            startTime: uint64(block.timestamp),
            lastCheckpoint: uint64(block.timestamp),
            settledAmount: 0,
            active: true
        });

        emit SessionOpened(
            id,
            msg.sender,
            service,
            ratePerSecond,
            msg.value,
            uint64(block.timestamp)
        );
    }

    /// @notice Derived accrued MON based on elapsed seconds: min(rate * elapsed, maxBudget)
    /// @dev Liability is bounded by maxBudget. If session is inactive, returns actual settledAmount.
    /// @param id Session ID
    function accrued(uint256 id) public view returns (uint256) {
        Session storage session = sessions[id];
        if (!session.active) {
            return session.settledAmount;
        }
        uint256 elapsed = block.timestamp - session.startTime;
        uint256 total = session.ratePerSecond * elapsed;
        if (total > session.maxBudget) {
            return session.maxBudget;
        }
        return total;
    }

    /// @notice Remaining unspent escrow for session
    /// @param id Session ID
    function remaining(uint256 id) public view returns (uint256) {
        Session storage session = sessions[id];
        if (!session.active) {
            return 0;
        }
        return session.maxBudget - accrued(id);
    }

    /// @notice Verification queried by backend gateway before and during execution
    /// @dev Returns true only if active, payer matches, and accrued < maxBudget
    /// @param id Session ID
    /// @param payer Expected payer wallet address
    function isAuthorized(uint256 id, address payer) external view returns (bool) {
        Session storage session = sessions[id];
        return session.active && session.payer == payer && accrued(id) < session.maxBudget;
    }

    /// @notice Stops session, pays accrued amount to treasury, and refunds unused budget to payer
    /// @dev Enforces strict Checks-Effects-Interactions to prevent reentrancy.
    ///      Only callable by session payer or designated settler hot wallet.
    /// @param id Session ID
    function stopSession(uint256 id) external {
        Session storage session = sessions[id];
        if (!session.active) revert SessionNotActive();
        if (msg.sender != session.payer && msg.sender != settler) revert Unauthorized();

        // 1. CHECKS & EFFECTS
        uint256 accruedAmount = accrued(id);
        session.active = false;
        session.settledAmount = accruedAmount;
        uint256 refund = session.maxBudget - accruedAmount;

        // 2. INTERACTIONS (CEI compliant)
        if (accruedAmount > 0) {
            (bool sentToTreasury, ) = treasury.call{value: accruedAmount}("");
            if (!sentToTreasury) revert TransferFailed();
        }

        if (refund > 0) {
            (bool refunded, ) = session.payer.call{value: refund}("");
            if (!refunded) revert TransferFailed();
        }

        emit SessionSettled(id, session.payer, accruedAmount, refund);
    }
}
