import React, { Component } from "react";
import {
    Row,
    Col,
    Tree,
    Form,
    Icon,
    Input,
    Button,
    DatePicker,
    Modal
} from "antd";
import PropTypes from "prop-types";
import Utils from "../../lib/utils";
import moment from "moment";
import "./editTask.css";

const { RangePicker } = DatePicker;
const FormItem = Form.Item;
const TreeNode = Tree.TreeNode;

class EditTask extends Component {
    static propTypes = {
        getTaskById: PropTypes.func,
        delTask: PropTypes.func,
        userToken: PropTypes.string,
        updateTask: PropTypes.func,
    };
    state = {
        taskTree: null,
        toEditTask: null,
        visible: false
    };
    componentDidMount() {
        console.log("edit", this.props);
        let taskId = this.props.match.params.taskId;
        // task = this.props.location.state.task;
        if (!taskId) {
            this.props.history.push("/login");
            return;
        }
        this.getTaskTreeById(taskId);
    }
    getTaskTreeById = id => {
        fetch("http://localhost:8082/tasks/tree/" + id, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.props.userToken}`
            }
        })
            .then(res => {
                if (res.status == 401) {
                    throw new Error(401);
                }
                return res.json();
            })
            .then(data => {
                var tree = data.data;
                tree = this.handleTaskTree(tree);
                this.setState({
                    taskTree: tree
                });
            })
            .catch(e => {
                if (e.message == 401) {
                    this.props.removeUser();
                } else {
                    console.error(e);
                }
            });
    };
    handleTaskTree = tree => {
        tree.startimeLong = tree.startime;
        tree.endtimeLong = tree.endtime;
        tree.startime = tree.startime
            ? Utils.dateFormat(new Date(tree.startime))
            : "";
        tree.endtime = tree.endtime
            ? Utils.dateFormat(new Date(tree.endtime))
            : "";
        if (tree.children && tree.children.length) {
            tree.children.forEach(t => {
                this.handleTaskTree(t);
            });
        }
        return tree;
    };
    toEdit = task => {
        this.setState({
            toEditTask: task
        });
    };
    toDelete = task => {
        this.setState({
            toDeleteTask: task
        });
        this.showModal();
    };
    toPlus = task => {};
    renderTreeNodes = tree => {
        return tree.map(item => {
            var title = (
                <div>
                    <span className="pr-1">{item.name}</span>
                    <Icon
                        className="pr-1 operator-icon"
                        type="edit"
                        onClick={() => {
                            this.toEdit(item);
                        }}
                    />
                    <Icon
                        className="pr-1 operator-icon"
                        type="delete"
                        onClick={() => {
                            this.toDelete(item);
                        }}
                    />
                    <Icon
                        className="pr-1 operator-icon"
                        type="plus"
                        onClick={() => {
                            this.toPlus(item);
                        }}
                    />
                </div>
            );
            if (item.children) {
                return (
                    <TreeNode title={title} key={item.id} dataRef={item}>
                        {this.renderTreeNodes(item.children)}
                    </TreeNode>
                );
            }
            return <TreeNode title={title} key={item.id} dataRef={item} />;
        });
    };

    showModal = () => {
        this.setState({
            visible: true
        });
    };

    handleOk = e => {
        this.setState({
            visible: false
        });
        var task = this.state.toDeleteTask;
        task.del = 1;
        fetch("http://localhost:8082/tasks", {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${this.props.userToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({task})
        }).then(res => {
            if (res.status == 401) {
                throw new Error(401)
            }
            return res.json()
        }).then(data => {
           if(data.code ===0 ) {
               //删除本地task
               this.props.delTask(task)
               this.props.history.push('/workbench')
           }
        });
    };

    handleCancel = e => {
        this.setState({
            visible: false,
            toDeleteTask: null
        });
    };
    redirecIndex = () => {
        this.props.history.push('/workbench')
    }
    render() {
        let taskTree = "";
        let tree = this.state.taskTree;
        taskTree = tree ? <Tree>{this.renderTreeNodes([tree])}</Tree> : "";
        return (
            <div>
                <Row className="d-flex">
                    <Modal
                        title="操作确认"
                        visible={this.state.visible}
                        onOk={this.handleOk}
                        onCancel={this.handleCancel}
                    >
                        <p>
                            确定删除任务
                            {this.state.toEditTask &&
                                this.state.toEditTask.name}
                            ?
                        </p>
                    </Modal>
                    <Col span={8}>
                        <div className="h5">任务概览</div>
                        <div>{taskTree}</div>
                    </Col>
                    {this.state.toEditTask ? (
                        <Col
                            span={16}
                            className="px-2 border-left border-primary"
                        >
                            <WrappedEditForm task={this.state.toEditTask} token={this.props.userToken} 
                            update={this.props.updateTask} redirec={this.redirecIndex}/>
                        </Col>
                    ) : (
                        ""
                    )}
                </Row>
            </div>
        );
    }
}
export default EditTask;

class EditForm extends Component {
    static propTypes = {
        task: PropTypes.object,
        token: PropTypes.string,
        update: PropTypes.func,
        redirec: PropTypes.func
    };
    handleSubmit = e => {
        e.preventDefault();
        this.props.form.validateFields((err, fieldsValue) => {
            if (err) {
                return;
            }
            const rangeValue = fieldsValue["taskAllotime"];
            const values = {
                ...fieldsValue,
                taskAllotime: [
                    rangeValue[0].format("YYYY-MM-DD HH:mm:ss"),
                    rangeValue[1].format("YYYY-MM-DD HH:mm:ss")
                ]
            };
        });
    };
    handleReset = () => {
        this.props.form.resetFields();
    };
    handleSubmit = (e) => {
        e.preventDefault();
        this.props.form.validateFields((err, values) => {
            if (!err) {
                const newTask = {
                    ...this.props.task,
                    name: values.taskName,
                    des:  values.des,
                    startime: values.taskAllotime[0].valueOf(),
                    endtime: values.taskAllotime[1].valueOf(),
                }
                fetch('http://localhost:8082/tasks',{
                    method: 'put',
                    headers: {
                        'Authorization': `Bearer ${this.props.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({task:newTask})
                }).then(res => {
                    if (res.status == 401) {
                        throw new Error(401)
                    }
                    return res.json() 
                }).then(data=>{
                    if(data.code===0) {
                        //本地更新task
                        this.props.update(newTask)
                        this.props.redirec()
                    }
                })
            }
        });
    }
    render() {
        let task = this.props.task;
        const { getFieldDecorator } = this.props.form;
        return (
            <Form className="w-mxl m-auto" onSubmit={this.handleSubmit}>
                <FormItem className="mb-1" label="任务名">
                    {getFieldDecorator("taskName", {
                        rules: [
                            {
                                required: true,
                                message: "请输入任务名"
                            }
                        ],
                        initialValue: task.name
                    })(
                        <Input
                            className="d-inline-block"
                            placeholder="任务名"
                        />
                    )}
                </FormItem>
                <FormItem className="mb-1" label="描述">
                    {getFieldDecorator("des", {
                        rules: [
                            {
                                required: false
                            }
                        ],
                        initialValue: task.des
                    })(<Input className="d-inline-block" placeholder="描述" />)}
                </FormItem>
                <FormItem className="mb-1" label="任务期限">
                    {getFieldDecorator("taskAllotime", {
                        rules: [
                            {
                                type: "array",
                                required: true,
                                message: "请输入任务期限"
                            }
                        ],
                        initialValue: [
                            moment(task.startimeLong),
                            moment(task.endtimeLong)
                        ]
                    })(
                        <RangePicker
                            className="w-100"
                            placeholder={["开始时间", "结束时间"]}
                        />
                    )}
                </FormItem>
                <div className="d-flex justify-content-around mt-4">
                    <Button onClick={this.handleReset}>重置</Button>
                    <Button type="primary" htmlType="submit">
                        提交
                    </Button>
                </div>
            </Form>
        );
    }
}

const WrappedEditForm = Form.create()(EditForm);
