/*
This project is a telegram bot for the canteen in Mittweida.
Telegram users can add the bot to receive the canteens menu
at 10am every day.

The bot fetches the menu from the official menu api at 1am
every weekday. The menu is broadcasted to every registered
user at 10am. This is done by storing the chatID of a user
upon executing the command /start.

The user can also request the menu manually by sending
the command /menu. 

Author: Tim Käbisch (https://github.com/timkaebisch)
Contact: tkaebisc@hs-mittweida.de
*/
const { Telegraf } = require('telegraf')
require('dotenv').config()
const axios = require("axios");
const { XMLParser } = require('fast-xml-parser');
const cron = require('node-cron')
const fs = require('fs')

const bot = new Telegraf(process.env.BOT_TOKEN)

let ids = [] // registered users
let menu // menu of the day

/*
    "CONSTRUCTOR"
    start bot with ids - can be used for updates 
    ids are getting saved upon greaceful stop
*/
if (process.argv.length > 2) {
    // read ids.txt and fetch menu
    if (process.argv[2] == "id") {
        fs.readFile(
            './ids.txt',
            function read(err, data) {
                if (err) {
                    console.log(err)
                    throw error
                }
                ids = data.toString().split('\n').map(Number)
            }
        )
        fetch_menu()
    } else if (process.argv[2] == "menu") {  
        // only fetch menu (for intial start)
        fetch_menu()
    } else {
        console.log("unknown argument")
    }
}

/*
    CRON JOBS
*/

/* 
fetch menu from api at 3:00am every day (exclude weekend)
(4 for now due to DLS - daylight saving time)
*/
cron.schedule('0 4 * * 1,2,3,4,5', () => {
    fetch_menu()
});

/*
broadcast the menu to all subscribers (ids) at 10am
every day (exclude weekend)
(11 for now due to DLS - daylight saving time)
*/
cron.schedule('0 11 * * 1,2,3,4,5', () => {
    broadcast()
});



/*
    BOT REACTIONS
*/

// command /start - user starts the bot
bot.start((ctx) => {
    const reply_start =
        "*Willkommen beim MensaBot der HSMW* \n" +
        "Dieser Bot sendet dir jeden Tag 10 Uhr den aktuellen Menseplan\\. \n \n" +
        "Du kannst folgende Befehle nutzen: \n" +
        "/help \\- zeigt Hilfe an \n" +
        "/menu \\- zeigt den Speiseplan manuell an \n" +
        "/ende \\- beendet den Bot \n" +
        "/start \\- startet den Bot"

    ctx.replyWithMarkdownV2(reply_start)

    // register user (add id to ids array)
    ids.push(ctx.message.chat.id)
});

// command /menu - user requests the menu manually
bot.hears('/menu', (ctx) => {
    // response depends if today is weekend or not
    let date = new Date()
    let isWeekend = date.getDay() % 6 == 0; // saturday = 6, sunday = 0
    // 0 % 6 and 6 % 6 == 0
    if (isWeekend) {
        ctx.replyWithMarkdownV2("Die Mensa hat am Wochenende leider geschlossen.")
    } else {
        ctx.replyWithMarkdownV2(menu)
    }
})

// command /help - user requests help
bot.hears('/help', (ctx) => {
    const help =
        "Dieser Bot sendet dir jeden Tag 10 Uhr den aktuellen Menseplan\\. \n \n" +
        "Du kannst folgende Befehle nutzen: \n" +
        "/help \\- zeigt Hilfe an \n" +
        "/menu \\- zeigt den Speiseplan manuell an \n" +
        "/ende \\- beendet den Bot \n" +
        "/start \\- startet den Bot \n \n" +
        "Bei weiteren Fragen wende dich an: tkaebisc@hs\\-mittweida\\.de"

    ctx.replyWithMarkdownV2(help)
})

// command /ende - user stops the bot
bot.hears('/ende', (ctx) => {
    const ende =
        "Die tägliche Zustellung des Mensaplans wurde *deaktiviert*\\. \n" +
        "Du kannst den Bot jederzeit mit /start wieder starten\\."

    ctx.replyWithMarkdownV2(ende)

    // unregister user from broadcast (remove id from ids)
    // id could appear multiple times in case the user started
    // and blocked the bot more than once within 1 day and then
    // stopped the bot with /ende
    let toRemove = []
    for (i = 0; i < ids.length; i++) {
        if (ids[i] == err.on.payload.chat_id) {
            toRemove.push(i)
        }
    }
    toRemove.forEach(index => {
        ids.splice(index, 1)
    })
})

// launch bot
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => {
    // write ids to ids.txt
    fs.writeFile(
        './ids.txt',
        ids.toString().replaceAll(",", "\n"),
        function (err) {
            if (err) {
                console.log('error writing ids.txt - log on console instead \n')
                console.log(ids)
            }
        }
    )
    bot.stop('SIGINT')
})

process.once('SIGTERM', () => {
    fs.writeFile(
        './ids.txt',
        ids.toString().replaceAll(",", "\n"),
        function (err) {
            if (err) {
                console.log('error writing ids.txt - log on console instead \n')
                console.log(ids)
            }
        }
    )
    bot.stop('SIGTERM')
})


/*
    FUNCTIONS
*/

// fetch menu from api and build a MarkdownV2 string
// an error is returned in case the api response
// is empty - that means the canteen is closed
// e.g. due to holiday
function fetch_menu() {
    axios.get(process.env.MENU_API_DAY)
        .then((res) => {
            menu = ""
            const parser = new XMLParser();
            let obj = parser.parse(res.data)
            // menus = json array of all dishes
            let menus = obj.response.menus.day.menu

            // create date of today
            var today = new Date();
            var dd = String(today.getDate()).padStart(2, '0');
            var mm = String(today.getMonth() + 1).padStart(2, '0');
            var yyyy = today.getFullYear();
            today = dd + '\\.' + mm + '\\.' + yyyy;

            menu += "*Mensaplan von Heute \\(" + today + "\\)* \n \n"
            menu += "*Preise:* Studenten, Mitarbeiter, Gäste, Schüler \n \n \n"

            // iterate over menus
            menus.forEach(dish => {
                // add type
                menu += "*" + dish.type + "* \n"

                // add description + remove additives + escape symbols
                let description = dish.description
                description = description.substring(0, description.indexOf("(") - 1)

                description = description.replaceAll(":", "")
                description = description.replaceAll(".", "\\.")
                description = description.replaceAll("-", "\\-")
                description = description.replaceAll("&", "\\&")
                description = description.replaceAll("+", "\\+")
                description = description.replaceAll("?", "\\?")
                description = description.replaceAll("|", "\\|")
                description = description.replaceAll("$", "\\$")
                description = description.replaceAll("[", "\\[")
                description = description.replaceAll("]", "\\]")
                description = description.replaceAll("^", "\\^")
                description = description.replaceAll("{", "\\{")
                description = description.replaceAll("}", "\\}")

                menu += description + "\n"

                // add price
                let prices = dish.prices.price
                let price = "Preise: "
                price += prices[0].value + "€, "
                price += prices[1].value + "€, "
                price += prices[2].value + "€, "
                price += prices[3].value + "€"
                menu += price + "\n \n"
            });

        })
        .catch((err) => {
            console.log(err)
            menu = "canteen closed"
        })
}

// broadcast the menu to all registered users (ids)
function broadcast() {
    // only broadcast when canteen is open
    if (menu != "canteen closed") {
        ids.forEach(id => {
            bot.telegram.sendMessage(id, menu, { parse_mode: 'MarkdownV2' }).catch((err) => {
                // catch "Forbidden: bot was blocked by the user"
                // remove user (id) from registered users (ids)
                // id could appear multiple times in case the
                // user started and blocked the bot more than once
                // within 1 day
                if (err.response.error_code == 403) {
                    let toRemove = []
                    for (i = 0; i < ids.length; i++) {
                        if (ids[i] == err.on.payload.chat_id) {
                            toRemove.push(i)
                        }
                    }
                    toRemove.forEach(index => {
                        ids.splice(index, 1)
                    })
                }
            })
        })
    }
}
