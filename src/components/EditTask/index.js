import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox } from 'antd';
import { Form, Icon, Input, Button, DatePicker } from 'antd';
import PropTypes from 'prop-types';

import Item from 'antd/lib/list/Item';
import './editTask.css';
const { RangePicker } = DatePicker;
const FormItem = Form.Item;
const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class EditTask extends Component {
    static propTypes = {
        getTaskById: PropTypes.func,
      } 
    state = {
        task: null
    }  
    componentDidMount() {
        console.log('edit', this.props)
        let taskId = this.props.match.params.taskId,
        task = this.props.location.state.task;
        if(task) {
            this.setState({
                task, 
            })
            return ;
        }
        if (!taskId) {
            this.props.history.push('/login');
            return ;
        }
        if(!task) {
            this.getTaskTreeById(taskId);
        }

    }
    getTaskTreeById = (id) => {
        fetch('http://localhost:8082/tasks/'+id, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.props.userToken}`
            }
        }).then(res => {
            if (res.status == 401) {
                throw new Error(401)
            }
            return res.json()
        }).then(data => {
            var task = data.data;
            task.creatime = task.creatime ? Utils.dateFormat(new Date(task.creatime)) : '';
            task.endtime = task.endtime ? Utils.dateFormat(new Date(task.endtime)) : '';
            this.setState({
                task,
            })
          
        }).catch(e => {
            if(e.message == 401) {
                this.props.removeUser();
            } else {
                console.error(e);
            }
        })
    }
    renderTreeNodes = (tasks) => {
        return tasks.map((item) => {
            var title = (
                <div>
                    <span className="pr-1">{item.name}</span>
                    <Icon className="pr-1 operator-icon" type="edit" />
                    <Icon className="pr-1 operator-icon" type="delete" />
                    <Icon className="pr-1 operator-icon" type="plus" />
                </div>
            );
            if (item.subTasks) {
                return (
                    <TreeNode title={title} key={item.id} dataRef={item}>
                        {this.renderTreeNodes(item.subTasks)}
                    </TreeNode>
                );
            }
            return <TreeNode title={title} key={item.id} dataRef={item} />;
        });
    }
    render() {
        let taskTree = '';
        let task = null;

        taskTree = task ? (
            <Tree>
                {this.renderTreeNodes([task])}
            </Tree>
        ) : '';

        return (
            <div>
                <header className="workbench-header">
                    <h3>工作台<small className="h6 ml-3">编辑你的任务</small></h3>
                </header>
                <Row className="d-flex">
                    <Col span={8}>
                        <div className="h5">任务概览</div>
                        <div>
                            {taskTree}
                        </div>
                    </Col>
                    <Col span={16} className="px-2 border-left border-primary">
                        <WrappedEditForm></WrappedEditForm>
                    </Col>
                </Row>

            </div>
        )
    }
}
export default EditTask;

class EditForm extends Component {

    handleSubmit = (e) => {
        e.preventDefault();
        this.props.form.validateFields((err, fieldsValue) => {
            if (err) {
                return;
            }
            const rangeValue = fieldsValue['taskAllotime'];
            const values = {
                ...fieldsValue,
                taskAllotime: [
                    rangeValue[0].format('YYYY-MM-DD HH:mm:ss'),
                    rangeValue[1].format('YYYY-MM-DD HH:mm:ss'),
                ],
            }
        })
    }
    handleReset = () => {
        this.props.form.resetFields();
    }
    render() {
        const { getFieldDecorator } = this.props.form;
        return (
            <Form className="w-mxl m-auto" onSubmit={this.handleSubmit}>
                <FormItem className="mb-1" label="任务名">
                    {getFieldDecorator('taskName', {
                        rules: [{
                            required: true, message: '请输入任务名',
                        }],
                    })(
                        <Input className="d-inline-block" placeholder="任务名" />
                    )}
                </FormItem>
                <FormItem className="mb-1" label="描述">
                    {getFieldDecorator('desc', {
                        rules: [{
                            required: false
                        }],
                    })(
                        <Input className="d-inline-block" placeholder="描述" />
                    )}
                </FormItem>
                <FormItem className="mb-1" label="任务期限">
                    {getFieldDecorator('taskAllotime', {
                        rules: [{
                            type: 'array',
                            required: true,
                            message: '请输入任务期限',
                        }],
                    })(
                        <RangePicker className="w-100" placeholder={['开始时间', '结束时间']} />
                    )}
                </FormItem>
                <div className="d-flex justify-content-around mt-4">
                    <Button onClick={this.handleReset}>重置</Button>
                    <Button type="primary" htmlType="submit">提交</Button>
                </div>
            </Form>
        )
    }
}

const WrappedEditForm = Form.create()(EditForm);