import React, { Component } from "react";
import { Switch, Select, Row, Col, Tree, Collapse, Checkbox } from "antd";
import PropTypes from "prop-types";

import { Form, Icon, Input, Button, DatePicker } from "antd";
import Item from "antd/lib/list/Item";
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
        saveTask: PropTypes.func,
    };
    componentDidMount() {
        if (!this.props.username || !this.props.userToken) {
            this.props.removeUser();
            return;
        }
        this.props.getTasks(this.props.userToken);
        console.log('tasks',this.props.tasks)
        var pid = this.props.match.params.pid;
        console.log('pid',pid)
    }
    getTaskById(id) {}

    render() {
        let content = (
            <div className="px-5 mx-auto" style={{ width: "600px" }}>
                <div className="">
                    <WrappedCreateForm tasks={[1, 2, 3]} token={this.props.userToken} save={this.props.saveTask}/>
                </div>
            </div>
        );
        return <div>{content}</div>;
    }
}
export default CreateTask;

class CreateForm extends React.Component {
    componentDidMount() {
        // this.props.form.setFieldsValue({
        //     parentask: '父任务'
        // })
    }
    handleSubmit = e => {
        e.preventDefault();
        this.props.form.validateFields((err, values) => {
            if (!err) {
                console.log("Received values of form: ", values);
                const task = {
                    name: values.taskName,
                    des:  values.describe,
                    startime: values.dateRange[0].valueOf(),
                    endtime: values.dateRange[1].valueOf()
                }
                console.log('token',this.props)
                fetch('http://localhost:8082/tasks',{
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.props.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({task})
                }).then(res => {
                    if (res.status == 401) {
                        throw new Error(401)
                    }
                    return res.json() 
                }).then(data=>{
                    if(data.code===0) {
                        task.id = 8;
                    }
                    //本地增加task
                    this.props.save(task)
                })
            }
        });
    };

    render() {
        const { getFieldDecorator } = this.props.form;
        const formItemLayout = {
            labelCol: {
                xs: { span: 24 },
                sm: { span: 8 }
            },
            wrapperCol: {
                xs: { span: 24 },
                sm: { span: 16 }
            }
        };
        const tailFormItemLayout = {
            wrapperCol: {
                xs: {
                    span: 24,
                    offset: 0
                },
                sm: {
                    span: 16,
                    offset: 8
                }
            }
        };
        return (
            <Form onSubmit={this.handleSubmit}>
                <FormItem className="mb-1" {...formItemLayout} label="任务名称">
                    {getFieldDecorator("taskName", {
                        rules: [
                            { required: true, message: "任务名称不能为空！" }
                        ]
                    })(<Input placeholder="任务名称" />)}
                </FormItem>
                <FormItem className="mb-1" {...formItemLayout} label="任务描述">
                    {getFieldDecorator("describe", {
                        rules: [{ required: false }]
                    })(<Input placeholder="任务描述" />)}
                </FormItem>
                <FormItem {...formItemLayout} label="任务期限">
                    {getFieldDecorator("dateRange", {
                        rules: [
                            {
                                type: "array",
                                required: true,
                                message: "任务时间不能为空!"
                            }
                        ]
                    })(<RangePicker />)}
                </FormItem>
                <FormItem className="mb-1" {...formItemLayout} label="父任务">
                    {getFieldDecorator("parentask", {
                        rules: [{ required: false }]
                    })(<Input disabled />)}
                </FormItem>
                {/* <FormItem className="mb-1" {...formItemLayout} label="父任务">
                    {getFieldDecorator("parentask2", {
                        rules: [{ required: false }]
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
                </FormItem> */}
                <FormItem className="mt-5" {...tailFormItemLayout}>
                    <Button
                        type="primary"
                        htmlType="submit"
                        className="login-form-button w-50"
                    >
                        提交
                    </Button>
                </FormItem>
            </Form>
        );
    }
}

const WrappedCreateForm = Form.create()(CreateForm);
