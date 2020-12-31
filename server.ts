import GameRoom from "./src/class/Room";
import { Map } from 'immutable';
import { ICardAction } from "./src/class/Game";

const http = require('http');
const socketIO = require('socket.io');
const dotenv = require('dotenv')
const ENV = process.env.NODE_ENV || 'development'

if (ENV === 'development') dotenv.config();

export enum WebSocketEvent {
  CreateRoom = 'create room',
  EnterRoom = 'enter room',
  SubmitName = 'submit name',
  SetWords = 'set words',
  SendAction = 'send action',
}

enum WebSocketEmissionEvent {
  Connect = 'connected to web socket',
  GetNewMember = 'got new member',
  ConfirmRoom = 'confirmed room exists',
  RejectRoom = 'rejected room exists',
  JoinRoom = 'joined room',
  CreateNewRoom = 'created new room',
  StartGame = 'started game',
  ReceiveAction = 'received action',
}

const PORT = process.env.PORT;
console.log(`Port: ${PORT}`);

let CurrentRooms = Map<string, GameRoom>();

const RoomNames = ['Apple', 'Watermelon', 'Orange', 'Strawberry', 'Grape', 'Blueberry', 'Lychee', 'Pear', 'Banana', 'Tangerine'];

const server = http.createServer();
const io = socketIO(server, {
  /**
   * override the default pingTimeout on your server to a large value.
   * There is a change for the default pingTimeout from 60000
   * (v2.0.4) to 5000 (v2.1.0+) which is not enough for some browsers like Chrome
   * */
  pingTimeout: 30000,
});

io.on('connection', (client: SocketIO.Socket) => {
  console.log(`User joined: ${client.id}`);
  const printClientAllInfo = () => Object.keys(io.sockets).forEach((key) => console.log(key));
  
  client.emit(WebSocketEmissionEvent.Connect);

  client.on('disconnect', () => {
    console.log(`User disconnected: ${client.id}`);
  });

  client.on('error', (error) => {
    console.log(error);
  });

  client.on(WebSocketEvent.SendAction, (action: ICardAction) => {
    const room = CurrentRooms.get(action.roomCode);
    if (!io.sockets.adapter.rooms[action.roomCode] || !room) return;

    io.to(action.roomCode).emit(WebSocketEmissionEvent.ReceiveAction, action);
    
    const { game } = room;
    game && game.updateCardStates(action.position, action.type);
  });

  client.on(WebSocketEvent.EnterRoom, ({roomCode}) => {
    if (io.sockets.adapter.rooms[roomCode])
    {
      client.emit(WebSocketEmissionEvent.ConfirmRoom, { roomCode });
    } else {
      client.emit(WebSocketEmissionEvent.RejectRoom, { roomCode });
    }
  });

  client.on(WebSocketEvent.CreateRoom, () => {
    let selectedRoom = null;

    // TODO: create a system to ensure infinite number of rooms can be created
    RoomNames.some((name) => {
      if (!CurrentRooms.has(name)) {
        selectedRoom = name;
        return true;
      }
    })

    if (selectedRoom) {
      client.join(selectedRoom); // can I simply create a room w/o joining? line 84 might cause the user to join twice
      CurrentRooms = CurrentRooms.set(selectedRoom, new GameRoom(selectedRoom));
      client.emit(WebSocketEmissionEvent.CreateNewRoom, { roomCode: selectedRoom });
    }
  });

  client.on(WebSocketEvent.SubmitName, ({ playerName, roomCode, playerRole }: { playerName: string, roomCode: string, playerRole: string }) => {
    if (io.sockets.adapter.rooms[roomCode] && CurrentRooms.get(roomCode))
    {
      client.join(roomCode);
      CurrentRooms.get(roomCode)!.addMember(client.id, playerName, playerRole);
      client.emit(WebSocketEmissionEvent.JoinRoom, { playerName });

      const allMembers = CurrentRooms.get(roomCode)!.getAllMemberNames();

      io.to(roomCode).emit(WebSocketEmissionEvent.GetNewMember, {
        roomCode,
        allMembers,
      });
    } else {
      client.emit(WebSocketEmissionEvent.RejectRoom, { roomCode });
    }

    client.on(WebSocketEvent.SetWords, ({ words, roomCode }: { words: [string, string][], roomCode: string }) => {
      const room = CurrentRooms.get(roomCode);
      if (room) {
        room.createNewGame(words, 1);
        room.game && room.game.printCurrentWordsAndOrder();
        io.to(roomCode).emit(WebSocketEmissionEvent.StartGame, {
          shuffledWords: room.game && room.game.shuffledWords,
          cardStates: room.game && room.game.cardStates,
        });
      }
    });
  });
});

server.listen(PORT, (error: Error) => {
  if (error) throw error;
  console.log(`listening on port ${PORT}`);
});