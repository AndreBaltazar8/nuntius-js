let nuntiusConn

function chatConnect(name) {
    nuntiusConn = newNuntiusConnection()
    nuntiusConn.onReady(function() {
        nuntiusConn.auth([0], btoa(name), [0]).then(function() {
            console.log('connected as', name)
        })
    })
    
    nuntiusConn.onIncomingConnection(function(incConn) {
        if (!incConn.isHandled()) {
            incConn.accept().then(function(remoteConn) {
                console.log('connection established to', atob(remoteConn.getRemoteID()))
                let name = atob(remoteConn.getRemoteID())
                let chat = createChat(name)
                chat.setName('Connected to ' + name)
                chatInitService(chat, remoteConn.conn)
            })
        }
    })
}

function createChat(name) {
    let chat = document.createElement('div')
    chat.class = 'chat'
    let chatName = document.createElement('div')
    chatName.textContent = 'Connecting to ' + name
    chat.appendChild(chatName)
    document.getElementById('open-chats').appendChild(chat)

    let chatContent
    function onText(who, text) {
        let chatLine = document.createElement('div')
        chatLine.textContent = who + ': ' + text
        chatContent.appendChild(chatLine)
    }

    return {
        setName: function(text) {
            chatName.textContent = text
        },
        setService: function(service) {
            chatContent = document.createElement('div')
            chat.appendChild(chatContent)
            
            let chatForm = document.createElement('form')
            chatForm.addEventListener('submit', function(event) {
                event.preventDefault()
            })
            let chatText = document.createElement('input')
            chatText.type = 'text'
            chatForm.appendChild(chatText)

            let chatButton = document.createElement('input')
            chatButton.type = 'submit'
            chatButton.value = 'Send'
            chatForm.appendChild(chatButton)

            chatButton.addEventListener('click', function(event) {
                event.preventDefault()
                let msg = chatText.value.trim()
                if (msg != "") {
                    service.Message(msg)
                    onText('me', msg)
                    chatText.value = ''
                }
            })
            chat.appendChild(chatForm)
        },
        onText: onText
    }
}

function chatInitService(chat, conn) {
    let service = autorpc.useConnection(conn, {
        'Message': ['string']
    }, {
        'Message': function(text) {
            chat.onText('other', text)
        }
    })

    chat.setService(service)
}

function chatConnectOther(name) {
    let chat = createChat(name)

    nuntiusConn.connectTo(btoa(name)).then(function(remoteConn) {
        console.log('connection established to', atob(remoteConn.getRemoteID()))
        chat.setName('Connected to ' + name)
        chatInitService(chat, remoteConn.conn)
    }, function(err) {
        chat.setName('Could not connect to ' + name + ', probably offline...')
        console.log('could not connect', err)
    })
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('connect-form').addEventListener('submit', function(event) {
        event.preventDefault()
    })
    document.getElementById('connect-button').addEventListener('click', function(event) {
        event.preventDefault()
        let name = document.getElementById('connect-name').value.trim()
        if (name != "") {
            chatConnect(name)
            document.getElementById('connect-form').parentNode.removeChild(document.getElementById('connect-form'))
            document.getElementById('chat').style.display = ''
        }
    })

    document.getElementById('contact-form').addEventListener('submit', function(event) {
        event.preventDefault()
    })
    document.getElementById('connect-other-button').addEventListener('click', function(event) {
        event.preventDefault()
        let name = document.getElementById('other-name').value.trim()
        if (name != "") {
            document.getElementById('other-name').value = ''
            chatConnectOther(name)
        }
    })
    
})