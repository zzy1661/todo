import React, { Component } from 'react';
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox } from 'antd';
import PropTypes from 'prop-types';

import { Form, Icon, Input, Button, DatePicker } from 'antd';
import Item from 'antd/lib/list/Item';
const { RangePicker } = DatePicker;
const FormItem = Form.Item;
const Option = Select.Option;
const TreeNode = Tree.TreeNode;
const Panel = Collapse.Panel;

class CreateTask extends Component {

    static propTypes = {
        username: PropTypes.string,
        userToken: PropTypes.string,
        removeUser: PropTypes.func,
        tasks: PropTypes.array,
        getTasks: PropTypes.func,
        updateTasks: PropTypes.func,
    }
    state = {
        pid: null
    }
    componentDidMount() {
        var pid = this.props.match.params.pid;
        this.setState({
            pid,
        })
        if (!this.props.username || !this.props.userToken) {
            this.props.removeUser();
            return;
        }
        this.props.getTasks(this.props.userToken);
    }
    getTaskById(id) {

    }
    render() {

        let content = (
            <div className="px-5 mx-auto" style={{ width: '600px' }}>
                <div className="">
                    <WrappedCreateForm tasks={this.props.tasks} pId={this.state.pid} />
                </div>
            </div>
        )
        return (
            <div>
                {content}
            </div>
        )
    }
}
export default CreateTask;

class CreateForm extends React.Component {
    
    componentDidMount() {
        this.props.form.setFieldsValue({
            parentask: '父任务'
        })
    }
    handleSubmit = (e) => {
        e.preventDefault();
        this.props.form.validateFields((err, values) => {
            if (!err) {
                console.log('Received values of form: ', values);
            }
        });
    }
  
    createTask = (e) => {
        fetch('http://localhost:8082/tasks',{
            method: 'POST',
            headers: {
				'Content-Type': 'application/json'
            },
            body: this.state.task
        }).then(res=>res.json()).then(data=>{
            if(data.code===0) {
                console.log('success')
                var handledTasks = data.data.map(task => {
                    task.startime = task.startime ? Utils.dateFormat(new Date(task.startime)) : '';
                    task.endtime = task.endtime ? Utils.dateFormat(new Date(task.endtime)) : '';
                    return task
                })
                this.props.updateTasks(handledTasks)
            }else {
                console.error('failed')
            }
        })
    }
    render() {
        const { getFieldDecorator } = this.props.form;
        const formItemLayout = {
            labelCol: {
                xs: { span: 24 },
                sm: { span: 8 },
            },
            wrapperCol: {
                xs: { span: 24 },
                sm: { span: 16 },
            },
        };
        const tailFormItemLayout = {
            wrapperCol: {
                xs: {
                    span: 24,
                    offset: 0,
                },
                sm: {
                    span: 16,
                    offset: 8,
                },
            },
        };
        return (
            <Form onSubmit={this.handleSubmit} >
                <FormItem className="mb-1"  {...formItemLayout} label="任务名称">
                    {getFieldDecorator('taskName', {
                        rules: [{ required: true, message: '任务名称不能为空！' }],
                    })(
                        <Input placeholder="任务名称" />
                    )}
                </FormItem>
                <FormItem className="mb-1"  {...formItemLayout} label="任务描述">
                    {getFieldDecorator('describe', {
                        rules: [{ required: false }],
                    })(
                        <Input placeholder="任务描述" />
                    )}
                </FormItem>
                <FormItem
                    {...formItemLayout}
                    label="任务期限"
                >
                    {getFieldDecorator('dateRange', {
                        rules: [{ type: 'array', required: true, message: '任务时间不能为空!' }],
                    })(
                        <RangePicker />
                    )}
                </FormItem>
                {this.props.pid?(<FormItem className="mb-1"  {...formItemLayout} label="父任务">
                    {getFieldDecorator('parentask', {
                        rules: [{ required: false }],
                    })(
                        <Input disabled />
                    )}
                </FormItem>):
                (<FormItem className="mb-1"  {...formItemLayout} label="父任务">
                    {getFieldDecorator('parentask2', {
                        rules: [{ required: false }],
                    })(
                        <Select>
                            {this.props.tasks?this.props.tasks.map(t=>{
                                return (<Option value={t.id} key={t.id}>{t.name}</Option>)
                            }):''}
                            <Option value="jack">Jack</Option>
                            <Option value="lucy">Lucy</Option>
                            <Option value="Yiminghe">yiminghe</Option>
                        </Select>
                    )}
                </FormItem>)}
                <FormItem className="mt-5" {...tailFormItemLayout}>
                    <Button type="primary" htmlType="submit" className="login-form-button w-50">提交</Button>
                </FormItem>
            </Form>
        );
    }
}

const WrappedCreateForm = Form.create()(CreateForm);
