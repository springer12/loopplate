import {Promise} from 'es6-promise';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as bluebird from 'bluebird';
import {Server} from 'app/server/interface/server';
import {UserService} from 'app/service/userService';
import {Activity} from 'app/models/interface/activity';
import {User} from 'app/models/interface/user';
import {
  SummaryReportInterface,
  CategoryReportInterface,
  UserReportInterface
} from 'app/service/summary/summaryReportInterface';

/**
 * sends summary info about system functionality:
 * like how many news were imported in past 24 hours
 * @class SummaryReporter
 * @author Nika Nikabadze
 */
export class SummaryReporter {

  /**
   * @const
   * @type {string}
   */
  public static readonly SUMMARY_EMAIL_SUBJECT = 'Today\'s summary';

  /**
   * @const
   * @type {string}
   */
  public static readonly SUMMARY_EMAIL_TEMPLATE = 'app/templates/email/summary-email.ejs';


  /**
   * @constructor
   * @param {Server} app
   */
  constructor(private app: Server) {
  }

  /**
   * sends today's summary
   * @returns {Promise}
   */
  public sendTodaySummary(): Promise<void> {
    let from = moment(new Date()).startOf('day').toDate();
    let to = moment(new Date()).endOf('day').toDate();

    return Promise.all([
      this.getTotalActivities(),
      this.getActivities(from, to),
      this.getNewUsers(from, to)
    ])
      .then<SummaryReportInterface>(results => {
        let total = results[0];
        let activities = results[1];
        let newUsers = results[2];

        return <SummaryReportInterface>{
          from: from,
          to: to,
          users: this.getUsersTotal(activities),
          categories: this.getCategoryTotal(activities),
          newUsers: newUsers,
          quantity: activities.length,
          total: total
        };
      })
      .then(summary => this.sendEmail(summary));
  }


  /**
   * @param {Activity[]} activities
   * @returns {UserReportInterface[]}
   */
  private getUsersTotal(activities: Activity[]): UserReportInterface[] {
    let groups = _.groupBy(activities, x => x.user.username);

    return Object.keys(groups)
      .map(username => ({
        username,
        quantity: groups[username].length
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }

  /**
   * @param {Activity[]} activities
   * @returns {CategoryReportInterface[]}
   */
  private getCategoryTotal(activities: Activity[]): CategoryReportInterface[] {
    let groups = _.groupBy(activities, x => x.category);

    return Object.keys(groups)
      .map(category => ({
        category,
        quantity: groups[category].length
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }

  /**
   * @param {Date} from
   * @param {Date} to
   * @returns {Promise<Activity[]>}
   */
  private getActivities(from: Date, to: Date): Promise<Activity[]> {
    const filter = {
      where: {
        and: [
          {createdAt: {gte: from}},
          {createdAt: {lte: to}}
        ]
      }
    };

    return this.app.models.Activity
      .find(filter)
      .then(activities => bluebird.map(
        activities,
        (activity: Activity) => {
          let activityJson = activity.toJSON ? activity.toJSON() : activity;

          return UserService.injectUser(this.app, activityJson)
            .then(() => activityJson);
        },
        {concurrency: 10})
      );
  }
  /**
   * @param {Date} from
   * @param {Date} to
   * @returns {Promise<User[]>}
   */
  private getNewUsers(from: Date, to: Date): Promise<User[]> {
    const filter = {
      where: {
        and: [
          {createdAt: {gte: from}},
          {createdAt: {lte: to}}
        ]
      }
    };

    return this.app.models.user
      .find(filter)
      .then(result => {
        return result;
      });
  }

  /**
   * returns total activity count
   * @returns {Promise<number>}
   */
  private getTotalActivities(): Promise<number> {

    return this.app.models.Activity.count();
  }

  /**
   * send's email with total news imported in db by period
   * @param {SummaryReportInterface} summary
   * @returns {Promise}
   */
  private sendEmail(summary: SummaryReportInterface): Promise<void> {

    return new Promise<void>((resolve, reject) => {
      let template = this.app.loopback.template(SummaryReporter.SUMMARY_EMAIL_TEMPLATE);
      let html = template({
        summary,
        host: `http://${this.app.get('domain')}`,
        moment
      });

      this.app.models.Email.send({
        to: this.app.get('email'),
        from: this.app.get('email'),
        subject: SummaryReporter.SUMMARY_EMAIL_SUBJECT,
        html: html
      }, function (err: Error) {
        if (err) {

          return reject(err);
        }

        return resolve();
      });
    });
  }
}
