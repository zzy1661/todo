import React, { Component } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { Row, Col, Button } from 'antd';
import './workbench.css';
import CreateTask from '../createTask';
import EditTask from '../editTask';
import All from '../allPlan';
import Finished from '../finishedPlan';
import Todo from '../todoPlan';

class Workbench extends Component {

    state = {
        tasks: [],
        taskId: null
    }
    componentDidMount() {
        fetch('https://easy-mock.com/mock/5b8baba761840c7b4033654b/todo/task', {
            method: 'GET'
        }).then(res => res.json())
            .then(data => {
                if (data.code === 1) {
                    this.setState({
                        tasks: data.data
                    })
                }
            })
    }
    toPlus = () => {
        this.props.history.push('/workbench/create');
    }
    toEdit = (index) => {
        this.props.history.push('/workbench/edit/'+index);
    }

    render() {
        var taskItems = this.state.tasks.map(item=>(
            <Col key={item.id} span={6}>
                <div className="media flex-column align-items-center p-1 pb-3 bg-primary text-white rounded h-100">
                    <div></div>
                    <div className="h5">{item.name}</div>
                    <p className="mb-1 media-body">{item.describe}</p>
                    <div className="d-flex align-items-center small justify-content-center">
                        <span>2007-12-14 </span>
                        <span className="px-2">~</span>
                        <span>2014-12-06 </span>
                    </div>
                    <div className="mt-2">
                        <Button type="default" className="mr-2" onClick={()=>this.toEdit(item.id)}>编辑</Button>
                        <Button type="danger">删除</Button>
                    </div>
                </div>
            </Col>
        ));
        taskItems.push( (
            <Col key={'add'} span={6}>
                <div className="media flex-column align-items-center justify-content-center p-1 pb-3 text-white rounded h-100">
                    <Button type="primary" size="large" onClick={this.toPlus}>+</Button>
                </div>
            </Col>
        ) )
        var workbenchome = (
            <div>
                <header className="workbench-header">
                   <h3>工作台<small className="h6 ml-3">创建/编辑你的任务</small></h3>
                </header>
                <Row gutter={16} className="d-flex">
                {taskItems}
                </Row>
            </div>
        );
        return (
          
                <div>
                    <Switch>
                        <Route path="/workbench" exact component={ () => workbenchome }></Route>
                        <Route path="/workbench/edit/:taskId" component={ EditTask }></Route>
                        <Route path="/workbench/create"  component={ CreateTask }></Route>               
                    </Switch>
                </div>
             
        )
    }
}
export default Workbench;