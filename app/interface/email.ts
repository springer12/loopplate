import {db} from 'loopback-crud';

export interface Email {

}

export interface EmailDataAccessObject extends db.DataAccessObject<Email> {
  send: (info: { to: string, from: string, subject: string, html: string },
         cb: (err?: Error) => void) => void;
}
