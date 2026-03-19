let deck = [];
let player = [];
let dealer = [];
let balance = 500;
let currentWager = 0;
let gameInProgress = false;
let isSplit = false;
let playerHand2 = [];
let currentHand = 1; 

function createDeck() {
    deck = [];
    let suits = ["hearts", "diamonds", "clubs", "spades"];
    let values = ["2","3","4","5","6","7","8","9","10","jack","queen","king","ace"];

    for (let count_suit = 0; count_suit < suits.length; count_suit++) {
        for (let count_suit_value = 0; count_suit_value < values.length; count_suit_value++) {
            let card = values[count_suit_value] + "_of_" + suits[count_suit];	
            deck.push(card);
        }
    }
}

function shuffleDeck() {
    for (let count_suit = 0; count_suit < deck.length; count_suit++) {
        let randomNum = Math.floor(Math.random() * deck.length);
        let swap = deck[count_suit];
        deck[count_suit] = deck[randomNum];
        deck[randomNum] = swap;
    }
}

function giveCards(hand, place) {
    let card = deck.pop();
    hand.push(card);
    let img = document.createElement("img");
    img.src = "cards/" + card + ".png";
    img.width = 80;
    document.getElementById(place).appendChild(img);
}

function getCardValue(card) {
    if (card.indexOf("jack") !== -1 ||
        card.indexOf("queen") !== -1 ||
        card.indexOf("king") !== -1) {
        return 10;
    }
    else if (card.indexOf("ace") !== -1) {
        return 11; 
    }
    else {
        return parseInt(card);
    }
}

function getScore(hand) {
    let total = 0;
    let aces = 0;
    for (let count_suit = 0; count_suit < hand.length; count_suit++) {
        let card = hand[count_suit];
        
        if (card.indexOf("jack") !== -1 ||
            card.indexOf("queen") !== -1 ||
            card.indexOf("king") !== -1) {
            total = total + 10;
        }
        else if (card.indexOf("ace") !== -1) {
            total = total + 11;
            aces++;
        }
        else {
            let number = parseInt(card);
            total = total + number;
        }
    }
    
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    
    return total;
}

function updateScores() {
    document.getElementById("player-score").innerHTML = "Score: " + getScore(player);
    
    if (isSplit) {
        document.getElementById("player2-score").innerHTML = "Score: " + getScore(playerHand2);
    }
    
    document.getElementById("dealer-score").innerHTML = "Score: " + getScore(dealer);
}

function updateCurrentHandIndicator() {
    if (!isSplit) return;
    
    if (currentHand === 1) {
        document.getElementById("player-cards").style.border = "3px solid yellow";
        document.getElementById("player2-cards").style.border = "none";
    } else {
        document.getElementById("player-cards").style.border = "none";
        document.getElementById("player2-cards").style.border = "3px solid yellow";
    }
}

function startGame() {
    document.getElementById("player-cards").innerHTML = "";
    document.getElementById("dealer-cards").innerHTML = "";
    document.getElementById("result").innerHTML = "";
    document.getElementById("player-cards").style.border = "none";
    
    
    document.getElementById("player2-section").style.display = "none";
    document.getElementById("split-btn").style.display = "inline-block";

    createDeck();
    shuffleDeck();

    player = [];
    playerHand2 = [];
    dealer = [];
    isSplit = false;
    currentHand = 1;

    
    balance -= currentWager;
    updateBalance();

    giveCards(dealer, "dealer-cards");
    giveCards(player, "player-cards");
    giveCards(player, "player-cards");

    updateScores();
    
    
    document.getElementById("game-buttons").style.opacity = "1";
    document.getElementById("game-buttons").style.pointerEvents = "auto";
    gameInProgress = false;
}

function hit() {
    if (currentWager === 0 || gameInProgress) return;
    
    let activeHand = currentHand === 1 ? player : playerHand2;
    let activePlace = currentHand === 1 ? "player-cards" : "player2-cards";
    
    giveCards(activeHand, activePlace);
    updateScores();
    
    if (getScore(activeHand) > 21) {
        if (isSplit && currentHand === 1) {
            
            document.getElementById("result").innerHTML = "Hand 1 busted! Playing Hand 2...";
            currentHand = 2;
            updateCurrentHandIndicator();
        } else if (isSplit && currentHand === 2) {
            
            endRound("Both hands busted! Dealer wins!", 0);
        } else {
            
            endRound("You busted! Dealer wins!", 0);
        }
    }
}

function canSplit() {
    if (player.length !== 2) return false;
    if (isSplit) return false;
    
    let card1Value = getCardValue(player[0]);
    let card2Value = getCardValue(player[1]);
    
    return card1Value === card2Value;
}

function split() {
    if (!canSplit()) {
        alert("You can only split pairs!");
        return;
    }
    
    if (currentWager > balance) {
        alert("Not enough money to split! You need to match your original bet.");
        return;
    }
    
    
    balance -= currentWager;
    updateBalance();
    
    isSplit = true;
    document.getElementById("split-btn").style.display = "none";
    
    
    let secondCard = player.pop();
    playerHand2.push(secondCard);
    
    
    document.getElementById("player2-section").style.display = "block";
    document.getElementById("player2-cards").innerHTML = "";
    
    
    document.getElementById("player-cards").innerHTML = "";
    let img = document.createElement("img");
    img.src = "cards/" + player[0] + ".png";
    img.width = 80;
    document.getElementById("player-cards").appendChild(img);
    
    
    let img2 = document.createElement("img");
    img2.src = "cards/" + playerHand2[0] + ".png";
    img2.width = 80;
    document.getElementById("player2-cards").appendChild(img2);
    
    
    giveCards(player, "player-cards");
    giveCards(playerHand2, "player2-cards");
    
    currentHand = 1;
    updateScores();
    updateCurrentHandIndicator();
    
    document.getElementById("result").innerHTML = "Playing Hand 1...";
}

function placeBet() {
    let wagerInput = document.getElementById("wager-input");
    let wager = parseInt(wagerInput.value);
    
    if (wager < 10) {
        alert("Minimum bet is $10");
        return;
    }

    if (wager > balance) {
        alert("You don't have enough money!");
        return;
    }

    currentWager = wager;
    document.getElementById("wager-section").style.display = "none";
    document.getElementById("pot-display").innerHTML = "Pot: $" + currentWager;

    startGame();
}

async function doubleDown() {
    if (currentWager === 0 || gameInProgress) return;
    
    if (currentWager > balance) {
        alert("Not enough money to double down!");
        return;
    }

    let activeHand = currentHand === 1 ? player : playerHand2;
    
    if (activeHand.length !== 2) {
        alert("You can only double down on your first two cards!");
        return;
    }

    gameInProgress = true;
    
    
    balance -= currentWager;
    updateBalance();
    
    let activePlace = currentHand === 1 ? "player-cards" : "player2-cards";
    giveCards(activeHand, activePlace);
    updateScores();

    if (getScore(activeHand) > 21) {
        if (isSplit && currentHand === 1) {
            document.getElementById("result").innerHTML = "Hand 1 busted! Playing Hand 2...";
            await sleep(1500);
            currentHand = 2;
            updateCurrentHandIndicator();
            gameInProgress = false;
            return;
        } else if (isSplit && currentHand === 2) {
            await dealerPlays();
        } else {
            endRound("You busted! Dealer wins!", 0);
        }
    } else {
        if (isSplit && currentHand === 1) {
            document.getElementById("result").innerHTML = "Hand 1 stands. Playing Hand 2...";
            await sleep(1500);
            currentHand = 2;
            updateCurrentHandIndicator();
            gameInProgress = false;
        } else {
            await dealerPlays();
        }
    }
}

function updateBalance() {
    document.getElementById("balance-display").innerHTML = "Balance: $" + balance;
}

async function stand() {
    if (currentWager === 0 || gameInProgress) return;
    
    if (isSplit && currentHand === 1) {
        document.getElementById("result").innerHTML = "Hand 1 stands. Playing Hand 2...";
        currentHand = 2;
        updateCurrentHandIndicator();
        await sleep(1500);
        return;
    }
    
    gameInProgress = true;
    await dealerPlays();
}

async function dealerPlays() {
    
    document.getElementById("game-buttons").style.opacity = "0.5";
    document.getElementById("game-buttons").style.pointerEvents = "none";
    
    
    document.getElementById("result").innerHTML = "Dealer reveals hole card...";
    await sleep(1000);
    updateScores();
    
    
    while (getScore(dealer) < 17) {
        await sleep(1000);
        document.getElementById("result").innerHTML = "Dealer hits...";
        giveCards(dealer, "dealer-cards");
        updateScores();
    }
    
    await sleep(800);
    determineWinner();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function determineWinner() {
    let dealerScore = getScore(dealer);
    let playerScore = getScore(player);
    let totalWinnings = 0;
    let resultMessage = "";

    if (isSplit) {
        let player2Score = getScore(playerHand2);
        
         
        if (playerScore > 21) {
            resultMessage += "Hand 1 busted. ";
        } else if (dealerScore > 21) {
            resultMessage += "Hand 1 wins! ";
            totalWinnings += currentWager * 2;
        } else if (playerScore > dealerScore) {
            resultMessage += "Hand 1 wins! ";
            totalWinnings += currentWager * 2;
        } else if (playerScore < dealerScore) {
            resultMessage += "Hand 1 loses. ";
        } else {
            resultMessage += "Hand 1 pushes. ";
            totalWinnings += currentWager;
        }
        
        
        if (player2Score > 21) {
            resultMessage += "Hand 2 busted.";
        } else if (dealerScore > 21) {
            resultMessage += "Hand 2 wins!";
            totalWinnings += currentWager * 2;
        } else if (player2Score > dealerScore) {
            resultMessage += "Hand 2 wins!";
            totalWinnings += currentWager * 2;
        } else if (player2Score < dealerScore) {
            resultMessage += "Hand 2 loses.";
        } else {
            resultMessage += "Hand 2 pushes.";
            totalWinnings += currentWager;
        }
        
        endRound(resultMessage, totalWinnings);
    } else {
             if (dealerScore > 21) {
            endRound("Dealer busted! You win!", currentWager * 2);
        }
        else if (playerScore > dealerScore) {
            endRound("You win!", currentWager * 2);
        }
        else if (playerScore < dealerScore) {
            endRound("Dealer wins!", 0);
        }
        else {
            endRound("Push! It's a tie.", currentWager);
        }
    }
}

function endRound(message, winnings) {
    document.getElementById("result").innerHTML = message;
    balance += winnings;
    updateBalance();
    document.getElementById("pot-display").innerHTML = "Pot: $0";
    document.getElementById("wager-section").style.display = "block";
    
    document.getElementById("game-buttons").style.opacity = "0.5";
    document.getElementById("game-buttons").style.pointerEvents = "none";
    
    currentWager = 0;
    gameInProgress = false;
    isSplit = false;
    currentHand = 1;
    
        document.getElementById("player-cards").style.border = "none";
    if (document.getElementById("player2-cards")) {
        document.getElementById("player2-cards").style.border = "none";
    }
}


document.getElementById("game-buttons").style.opacity = "0.5";
document.getElementById("game-buttons").style.pointerEvents = "none";