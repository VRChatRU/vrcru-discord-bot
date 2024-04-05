import { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } from 'discord.js'

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessageTyping,
		GatewayIntentBits.GuildMembers
	],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
})

const stickyMessages = await Bun.file('json/stickyMessages.json').json()
let stickyTimeout = false
const mutedUsers = await Bun.file('json/mutedUsers.json').json()

client.once('ready', async client => {
    const server = client.guilds.cache.get(Bun.env.SERVER_ID)
    const botChannel = client.channels.cache.get(Bun.env.BOT_CHANNEL_ID)

	console.log(client.user.tag + ' started successfully')
    botChannel.send('Я снова работаю!')

    updatePlayerCount()
    setInterval(() => {
        updatePlayerCount()
        updateMuteStatus(server, botChannel)
    }, 60000)
})

client.on('guildMemberAdd', member => {
    mutedUsers.forEach(mutedUser => {
        if(mutedUser.id === member.id) {
            member.roles.add(Bun.env.MUTE_ROLE_ID)
            console.log('Mute role on join assigned: ' + member.displayName)
        }
    })
})

client.on('messageCreate', message => {
    const server = client.guilds.cache.get(Bun.env.SERVER_ID)
    const botChannel = client.channels.cache.get(Bun.env.BOT_CHANNEL_ID)
    const channelID = message.channel.id
    const memberRoles = message.member.roles.cache
    const userID = message.author.id

    if(message.author.bot) return

    //Личка

    if(!message.guild && !message.author.bot) {
        //Скриншот недели смена баннера через лс
        if(userID === Bun.env.WEEKLY_IMG_HOST_ID) {
            if (message.attachments.size > 0) {
                const attachments = []
                message.attachments.forEach(attachment => {
                    attachments.push(attachment.url)
                })
                server.setBanner(attachments[0])
                    .then(() => { console.log('Updated the guild banner'); message.react('✅') })
                    .catch(console.error)
            }
        }
    }
    if(!message.guild) return

    //Скриншот недели добавление плюса
    if(channelID === Bun.env.WEEKLY_IMG_CHANNEL_ID && userID === Bun.env.WEEKLY_IMG_HOST_ID) {
        if (message.attachments.size > 0) {
            message.react('<:Icon_VRChatPlus:918776313953792041>')
            // message.react('✅')
        }
    }

    //Кинотеатр добавление оценок
    if(channelID === Bun.env.CINEMA_CHANNEL_ID && (memberRoles.has(Bun.env.MOD_ROLE_ID) || memberRoles.has(Bun.env.ORG_ROLE_ID))) {
        if(!message.content.match(/Как\sвам\s/g)) return
        message.react('1⃣')
        message.react('2⃣')
        message.react('3⃣')
        message.react('4⃣')
        message.react('5⃣')
    }

    //Обновить стики сообщение
    stickyMessages.forEach(sticky => {
        if(stickyTimeout) return
        if(channelID === sticky.channel) {
            stickyTimeout = true
            setTimeout(() => {
                if(!sticky) return
                message.channel.messages.delete(sticky.lastMessage)
                message.channel.send({ embeds: [renderStickyMessage(sticky.message)] }).then(message => {
                    sticky.lastMessage = message.id
                    Bun.write('json/stickyMessages.json', JSON.stringify(stickyMessages, null, 2))
                })
                stickyTimeout = false
            }, 10000)
        }
    })
    
    //Команды модераторов

    if(!memberRoles.has(Bun.env.MOD_ROLE_ID)) return

    //Долгий мут ?warn ID123 Вы были заглушенны на N дней || ?smute ID123 N дней
    if(channelID === Bun.env.MOD_LOG_CHANNEL_ID) {
        if(message.content.match(/\?warn\s\d{18}\sВы\sбыли\sзаглушены\sна\s\d{1,3}\sдней/g) || message.content.match(/\?smute\s\d{18}\s\d{1,3}\sдней/g)) {
            const targetUserID = message.content.match(/\d{18}/g)[0]
            const timeoutLength = message.content.match(/\d{1,3}\sдней/g)[0].replace(' дней', '')
            try {
                message.guild.members.fetch(targetUserID).then(targetUser => {
                    const newlyMutedUser = {
                        id: targetUserID,
                        mutedTill: Date.now() + (timeoutLength * 86400000)
                    }
                    console.log('Saving mute data... ID: ' + targetUserID + ' Muted till: ' + newlyMutedUser.mutedTill + ' (' + timeoutLength + 'd)')
                    mutedUsers.push(newlyMutedUser)
                    Bun.write('json/mutedUsers.json', JSON.stringify(mutedUsers, null, 2))
                    targetUser.roles.add(Bun.env.MUTE_ROLE_ID)
                    message.react('✅')
                    botChannel.send(`**${targetUser.displayName}** замьючен до <t:${Math.round(newlyMutedUser.mutedTill/1000)}:F>`)
                })
            } catch(error) { console.error(error) }
        }
    }

    //Бот чат

    if(channelID !== Bun.env.BOT_CHANNEL_ID) return
    // console.log('Bot channel message: ' + message.content)

    //Добавить стики сообщение ?stick [Ид канала]
    if(message.content.match(/\?stick\s<#\d{18,19}>\s/g)) {
        const targetChannel = client.channels.cache.get(message.content.match(/\d{18,19}/g)[0])
        const stickyMessage = message.content.replace(/\?stick\s<#\d{18,19}>\s/g, '')
        targetChannel.send({ embeds: [renderStickyMessage(stickyMessage)] }).then(message => {
            stickyMessages.push({
                channel: targetChannel.id,
                lastMessage: message.id,
                message: stickyMessage
            })
            Bun.write('json/stickyMessages.json', JSON.stringify(stickyMessages, null, 2))
        })
        message.react('✅')
    }

    //Удалить стики сообщение
    if(message.content.match(/\?delstick\s<#\d{18,19}>/g)) {
        const targetChannel = client.channels.cache.get(message.content.match(/\d{18,19}/g)[0])
        stickyMessages.forEach((sticky, i) => {
            if(sticky.channel === targetChannel.id) {
                targetChannel.messages.delete(sticky.lastMessage)
                stickyMessages.splice(i, 1)
                Bun.write('json/stickyMessages.json', JSON.stringify(stickyMessages, null, 2))
                message.react('✅')
            }
        })
    }

    // ?say
    if(message.content.match(/\?say\s<#\d{18,19}>\s/g)) {
        const targetChannel = client.channels.cache.get(message.content.match(/\d{18,19}/g)[0])
        const botMessage = message.content.replace(/\?say\s<#\d{18,19}>\s/g, '')
        targetChannel.send(botMessage)
        message.react('✅')
    }
})

client.login(Bun.env.BOT_TOKEN)

async function updatePlayerCount() {
    try {
        const response = await fetch('https://api.vrchat.cloud/api/1/visits', {
            headers: { 'User-Agent': 'VRChatRU discord bot/3.0 vard@disroot.org' },
        })
        const body = await response.json()

        if(!Number(body)) return

        client.user.setPresence({
            activities: [{ name: `VRChat с ${body} пользователями`, type: ActivityType.Playing }]
        })
    } catch(error) { console.error(error) }
}

async function updateMuteStatus(server, botChannel) {
    mutedUsers.forEach(async (mutedUser, i) => {
        if(Date.now() > mutedUser.mutedTill) {
            mutedUsers.splice(i, 1)
            await Bun.write('json/mutedUsers.json', JSON.stringify(mutedUsers, null, 2))
            try {
                const user = await server.members.fetch(mutedUser.id)
                user.roles.remove(Bun.env.MUTE_ROLE_ID)
                botChannel.send(user.displayName + ' размьючен')
            } catch(error) { console.error(error) }
        }
    })
}

function renderStickyMessage(message) {
    const embed = new EmbedBuilder()
        .setColor(0xf1c41b)
        .setTitle('Внимание!')
        .setDescription(message)
        .setFooter({ text: 'Модерация VRChatRU', iconURL: 'https://i.imgur.com/72pQbbd.png' })
    return embed
}