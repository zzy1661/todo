import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { Row, Col, Button } from 'antd';

class WorkbenchHome extends Component {

    static propTypes = {
        username: PropTypes.string,
        userToken: PropTypes.string,
        removeUser: PropTypes.func,
        tasks: PropTypes.array,
        getTasks: PropTypes.func,
      }
    
    componentDidMount() {
        if (!this.props.username || !this.props.userToken) {
            this.props.removeUser();
            return;
          }
          this.props.getTasks(this.props.userToken);
    }
    toPlus = () => {
        this.props.history.push('/workbench/create');
    }
    toEdit = (index) => {
        var toEditTask = this.props.tasks.filter(task=>task.id === index)[0]
       
        this.props.history.push({pathname:'/workbench/edit/'+index,state:{task: toEditTask}});
    }

    render() {
        var allTasks = this.props.tasks;
        var rootTasks = allTasks ? allTasks.filter(item => item.pid === 0) : [];
        let taskItems = rootTasks.map(item => (
            <Col key={item.id} span={8} xl={6} >
                <div className="media flex-column align-items-center p-1 py-3 mb-4 bg-primary text-white rounded h-150">
                    <div></div>
                    <div className="h5">{item.name}</div>
                    <p className="mb-1 media-body">{item.des}</p>
                    <div className="d-flex align-items-center small justify-content-center">
                        <span>{item.startime}</span>
                        <span className="px-2">~</span>
                        <span>{item.endtime}</span>
                    </div>
                    <div className="mt-2">
                        <Button type="default" className="mr-2" onClick={() => this.toEdit(item.id)}>编辑</Button>
                        <Button type="danger">删除</Button>
                    </div>
                </div>
            </Col>
        ));
        taskItems.push((
            <Col key={'add'} span={6}>
                <div className="media flex-column align-items-center justify-content-center p-1 py-3 text-white rounded h-150">
                    <Button type="primary" size="large" onClick={this.toPlus}>+</Button>
                </div>
            </Col>
        ))
        return (<div>
            <Row gutter={16} className="d-flex flex-wrap">
                {taskItems}
            </Row>
        </div>)

    }

}

export default WorkbenchHome;