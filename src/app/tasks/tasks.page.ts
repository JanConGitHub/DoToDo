import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { ActionSheetController, ModalController, AlertController, PopoverController, GestureController } from '@ionic/angular';

import { Router } from '@angular/router';
import { TaskService } from '../services/task.service';
import { CreateTaskTypeComponent } from './create-task-type/create-task-type.component';
import { TaskAddQuickComponent } from './task-add-quick/task-add-quick.component';
import { Task, TaskForDisplay } from '../models/task';
import { convertYYYYMMDD } from '../utilities/utility';
import * as icons from '../constants/icons';
import { presentAlertConfirm } from '../ion-components/alert';
import { presentPopover } from '../ion-components/popover';
import { SettingService } from '../services/setting.service';
import { Setting } from '../models/setting';
import { NotificationsComponent } from './notifications/notifications.component';
import { NotificationService } from '../services/notification.service';
import { Subscription, interval } from 'rxjs';
import { DatePipe } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { DateProxyPipe } from '../shared/pipes/date-proxy.pipe';


@Component({
  selector: 'app-tasks',
  templateUrl: 'tasks.page.html',
  styleUrls: ['tasks.page.scss'],
})
export class TasksPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('taskList', { read: ElementRef }) taskList: ElementRef;
  toolbarText = '';
  segmentValue = 'active';
  showSpinner = false;
  settingsIcon = icons.ionIcons.settingsOutline;
  addTaskIcon = icons.ionIcons.addOutline;
  closeIcon = icons.ionIcons.close;
  editIcon = icons.ionIcons.createOutline;
  deleteIcon = icons.ionIcons.trashOutline;
  prevDayIcon = icons.ionIcons.chevronBackOutline;
  nextDayIcon = icons.ionIcons.chevronForwardOutline;
  reopenIcon = icons.ionIcons.lockOpenOutline;
  markAsDoneIcon = icons.ionIcons.checkmarkDoneOutline;
  notificationsIcon = icons.ionIcons.notifications;
  notificationsOutlineIcon = icons.ionIcons.notificationsOutline;
  checklistIcon = icons.ionIcons.checkboxOutline;
  noteIcon = icons.ionIcons.documentTextOutline;
  menuIcon = icons.ionIcons.menuSharp;
  loadedTasks: TaskForDisplay[] = [];
  settings: Setting[] = [];
  loadedDate: number;
  loadedDatetime: Date;
  notificationsCount = 0;
  today = convertYYYYMMDD(new Date());
  minutesNow = new Date().getTime() / 1000 / 60;
  notificationSub: Subscription;
  settingSub: Subscription;
  taskSub: Subscription;
  loadedDateTimeSub: Subscription;
  intervalSub: Subscription;
  constructor(
    private actionSheetController: ActionSheetController,
    private router: Router,
    private taskService: TaskService,
    private settingService: SettingService,
    private notificationService: NotificationService,
    private popoverController: PopoverController,
    private modalController: ModalController,
    private alertController: AlertController,
    private gestureController: GestureController,
    private datePipe: DateProxyPipe,
    private translate: TranslateService
  ) { }

  ngOnInit() {
    this.initApp();
    this.notificationSub = this.notificationService.notifications.subscribe({
      next: (notifications) => {
        this.notificationsCount = notifications.length;
      }
    });
    this.settingSub = this.settingService.settings
      .subscribe({
        next: (settings: Setting[]) => {
          this.settings = settings;
          this.applySettings(settings);
        }
      });
    this.taskSub = this.taskService.tasks
      .subscribe({
        next: (tasks: TaskForDisplay[]) => {
          this.loadedTasks = tasks.map((task, i) => {
            task.expanded = false;
            return task;
          });
        }
      });
    this.loadedDateTimeSub = this.taskService.loadedDateTime.subscribe({
      next: (dateTime) => {
        this.loadedDatetime = dateTime;
        this.loadedDate = +convertYYYYMMDD(this.loadedDatetime);
        this.setDateTitle(this.loadedDatetime);
        this.loadTasks();
      }
    });
  }

  ngAfterViewInit() {
    const gesture = this.gestureController.create({
      gestureName: 'change-day',
      el: this.taskList.nativeElement,
      onEnd: ev => {
        if (ev.deltaX > 50) {
          this.loadPreviousDay();
        }
        if (ev.deltaX < -50) {
          this.loadNextDay();
        }
      }
    }, true);
    gesture.enable();
  }

  async applyTheme(enableDarkMode) {
    if (enableDarkMode !== undefined) {
      if (enableDarkMode.value === 'true') {
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.setAttribute('data-theme', 'light');
      }
    }
  }

  async applySettings(settings: Setting[]) {
    const enableDarkMode = settings.find(s => s.name === 'enableDarkMode');
    this.applyTheme(enableDarkMode);
  }

  async initApp() {
    const enableDarkMode = await this.settingService.getSetting('enableDarkMode');
    await this.applyTheme(enableDarkMode);
    this.showSpinner = true;
    await this.settingService.initSettings();
    await this.settingService.loadSettings();
    const initNotificationsSummaryRunDateSetting = this.settings.find(s => s.name === 'initNotificationsSummaryRunDate');
    if (initNotificationsSummaryRunDateSetting.value !== this.today) {
      this.notificationService.loadInitNotificationsSummary();
      initNotificationsSummaryRunDateSetting.value = this.today;
      await this.settingService.updateSetting(initNotificationsSummaryRunDateSetting);
    }
    this.notificationService.reloadNotifications();
    const reloadInterval = interval(1000 * 60);
    this.intervalSub = reloadInterval.subscribe({
      next: () => {
        if (this.today !== convertYYYYMMDD(new Date())) {
          location.reload();
        }
        this.minutesNow = new Date().getTime() / 1000 / 60;
        this.notificationService.reloadNotifications();
      }
    });
    let taskSchedulerRunDateSetting = await this.settingService.getSetting('taskSchedulerRunDate');
    if (taskSchedulerRunDateSetting === undefined || taskSchedulerRunDateSetting.value !== this.today) {
      const newTaskCreated = await this.taskService.executeDailyTaskSchedule(new Date());
      if (newTaskCreated) {
        await this.loadTasks();
      }
      if (taskSchedulerRunDateSetting === undefined) {
        taskSchedulerRunDateSetting = {
          id: -1,
          name: 'taskSchedulerRunDate',
          value: this.today
        }
        await this.settingService.addSetting(taskSchedulerRunDateSetting);
      } else {
        taskSchedulerRunDateSetting.value = this.today;
        await this.settingService.updateSetting(taskSchedulerRunDateSetting);
      }
    }
    let pendingTaskCopyRunDateSetting = await this.settingService.getSetting('pendingTaskCopyRunDate');
    const autoImportPendingTasksSetting = await this.settingService.getSetting('autoImportPendingTasks');
    if (pendingTaskCopyRunDateSetting === undefined || pendingTaskCopyRunDateSetting.value !== this.today) {
      const pendingTasks = await this.taskService.getPendingTasks();
      if (pendingTasks.length > 0) {
        if (autoImportPendingTasksSetting.value === 'true') {
          for (const task of pendingTasks) {
            task.dueDateTime = new Date(task.dueDateTime.setDate(task.dueDateTime.getDate() + 1));
            task.dueDate = +convertYYYYMMDD(task.dueDateTime);
            task.refTaskId = -1;
            task.done = false;
            await this.taskService.addNewTask(task, this.loadedDate);
          }
        } else {
          const confirm = await presentAlertConfirm(this.alertController,
            this.translate.instant('TASK_LIST.unfinished_task_copy_confirm_msg'),
            this.translate.instant('TASK_LIST.copy_tasks'),
            this.translate.instant('TASK_LIST.ignore'),
            this.translate.instant('TASK_LIST.copy'), '320px', []);
          if (confirm.result) {
            for (const task of pendingTasks) {
              task.dueDateTime = new Date(task.dueDateTime.setDate(task.dueDateTime.getDate() + 1));
              task.dueDate = +convertYYYYMMDD(task.dueDateTime);
              task.refTaskId = -1;
              task.done = false;
              await this.taskService.addNewTask(task, this.loadedDate);
            }
          }
        }
      }
      if (pendingTaskCopyRunDateSetting === undefined) {
        pendingTaskCopyRunDateSetting = {
          id: -1,
          name: 'pendingTaskCopyRunDate',
          value: this.today
        }
        await this.settingService.addSetting(pendingTaskCopyRunDateSetting);
      } else {
        pendingTaskCopyRunDateSetting.value = this.today;
        await this.settingService.updateSetting(pendingTaskCopyRunDateSetting);
      }
    }
    this.showSpinner = false;
  }

  ionViewWillEnter() {
    this.loadTasks();
  }

  async loadTasks() {
    await this.taskService.getAllTasksByDate(this.loadedDate)
  }

  segmentChanged(event: any) {
    this.segmentValue = event.detail.value;
  }

  onTaskSelect(task: TaskForDisplay) {
    this.presentActionSheet(task);
  }

  async presentActionSheet(task: TaskForDisplay) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Task',
      buttons: [
        {
          text: task.done ? 'Reopen Task' : 'Mark As Done',
          icon: task.done ? this.reopenIcon : this.markAsDoneIcon,
          handler: () => {
            this.onToggleDone(task);
          }
        },
        {
          text: 'Edit Task',
          icon: this.editIcon,
          handler: () => {
            this.router.navigate(['/', 'tasks', 'task-create-edit', task.id]);
          }
        },
        {
          text: 'Delete Task',
          icon: this.deleteIcon,
          handler: () => {
            this.deleteTask(task.id);
          }
        },
        {
          text: 'Cancel',
          icon: this.closeIcon,
          role: 'cancel'
        }]
    });
    await actionSheet.present();
  }

  toggleExpandItem(task: TaskForDisplay) {
    const index = this.loadedTasks.map(item => item.id).indexOf(task.id);
    if (!this.loadedTasks[index].expanded) {
      for (const [i, note] of this.loadedTasks.entries()) {
        note.expanded = false;
      }
    }
    this.loadedTasks[index].expanded = !this.loadedTasks[index].expanded;
  }

  async onCreateNewTaskTypeSelect(event) {
    const { data } = await presentPopover(this.popoverController, event, CreateTaskTypeComponent);
    if (data) {
      if (data.taskType === 'quick') {
        this.presentCreateNewQuickTaskModal();
      } else if (data.taskType === 'advanced') {
        this.router.navigate(['/', 'tasks', 'task-create-edit', 'new']);
      } else if (data.taskType === 'checklist') {
        this.router.navigate(['/', 'tasks', 'checklist-create-edit', 'new']);
      }
    }
  }

  async showNotifications(event) {
    await presentPopover(this.popoverController, event, NotificationsComponent, null, '320px');
    await this.notificationService.deactivateAllNotifications();
  }


  async presentCreateNewQuickTaskModal() {
    const modal = await this.modalController.create({
      component: TaskAddQuickComponent
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data !== null) {
      await this.createQuickTask(data.name, data.dueDate);
    }
  }

  async createQuickTask(name: string, dueDate: string) {
    const task: Task = {
      id: -1,
      name,
      remarks: '',
      done: false,
      dueDateTime: new Date(dueDate),
      dueDate: +convertYYYYMMDD(dueDate),
      list: 'Personal',
      repeat: 'no-repeat',
      repeating: 'false',
      refTaskId: -1,
      type: 'live',
      detail: {}
    }
    await this.taskService.addNewTask(task, this.loadedDate);
  }

  loadPreviousDay() {
    this.taskService.setLoadedDateTime(new Date(this.loadedDatetime.setDate(this.loadedDatetime.getDate() - 1)));
  }

  loadNextDay() {
    this.taskService.setLoadedDateTime(new Date(this.loadedDatetime.setDate(this.loadedDatetime.getDate() + 1)));
  }

  async onToggleDone(task: TaskForDisplay) {
    const taskToUpdate = { ...task };
    delete taskToUpdate.expanded;
    const confirm = await presentAlertConfirm(this.alertController,
      task.done ? this.translate.instant('TASK_LIST.task_reopen_confirm_msg') : this.translate.instant('TASK_LIST.task_done_confirm_msg'),
      this.translate.instant('TASK_LIST.task_status_change_confirm_header'),
      this.translate.instant('TASK_LIST.cancel'),
      task.done ? this.translate.instant('TASK_LIST.reopen') : this.translate.instant('TASK_LIST.finish'),
      '320px',
      [{ name: 'comment', type: 'text', placeholder: this.translate.instant('TASK_LIST.add_comment') }]);
    if (confirm.result) {
      taskToUpdate.done = !task.done;
      if (taskToUpdate.done) {
        taskToUpdate.remarks = confirm.data.comment === ''
          ? this.translate.instant('TASK_LIST.marked_done_default_comment')
          : confirm.data.comment;
      }
      else {
        taskToUpdate.remarks = confirm.data.comment === ''
          ? this.translate.instant('TASK_LIST.marked_reopened_default_comment')
          : confirm.data.comment;
      }
      this.taskService.updateTaskDone(taskToUpdate);
    }
  }

  async deleteTask(taskId) {
    const confirm = await presentAlertConfirm(this.alertController, this.translate.instant('TASK_LIST.delete_task_confirm_msg'),
      this.translate.instant('TASK_LIST.delete_task_confirm_header'),
      this.translate.instant('TASK_LIST.cancel'),
      this.translate.instant('TASK_LIST.okay'),
      null, []);
    if (confirm.result) {
      await this.taskService.deleteTask(taskId);
    }
  }

  editTask(taskId) {
    this.router.navigate(['/', 'tasks', 'task-create-edit', taskId]);
  }

  setDateTitle(date: Date) {
    const dateStr = convertYYYYMMDD(date);
    const todayStr = convertYYYYMMDD(new Date());
    const yesterdayStr = convertYYYYMMDD(new Date().setDate(new Date().getDate() - 1));
    const tomorrow = convertYYYYMMDD(new Date().setDate(new Date().getDate() + 1));
    switch (dateStr) {
      case todayStr: {
        this.translate.get('TASK_LIST.today').subscribe((result: string) => {
          this.toolbarText = result
            + ' ('
            + this.datePipe.transform(new Date(), 'EEE ')
            + this.datePipe.transform(new Date(), 'mediumDate')
            + ')';
        });
        break;
      }
      case yesterdayStr: {
        this.translate.get('TASK_LIST.yesterday').subscribe((result: string) => {
          this.toolbarText = result
            + ' ('
            + this.datePipe.transform(new Date().setDate(new Date().getDate() - 1), 'EEE ')
            + this.datePipe.transform(new Date().setDate(new Date().getDate() - 1), 'mediumDate')
            + ')';
        });
        break;
      }
      case tomorrow: {
        this.translate.get('TASK_LIST.tomorrow').subscribe((result: string) => {
          this.toolbarText = result
            + ' ('
            + this.datePipe.transform(new Date().setDate(new Date().getDate() + 1), 'EEE ')
            + this.datePipe.transform(new Date().setDate(new Date().getDate() + 1), 'mediumDate')
            + ')';
        });
        break;
      }
      default: { 
        this.toolbarText = this.datePipe.transform(new Date(date), 'EEE ')
                          + this.datePipe.transform(new Date(date), 'mediumDate')
      }
    }
  };

  ngOnDestroy() {
    this.notificationSub.unsubscribe();
    this.settingSub.unsubscribe();
    this.taskSub.unsubscribe();
    this.loadedDateTimeSub.unsubscribe();
  }
}
